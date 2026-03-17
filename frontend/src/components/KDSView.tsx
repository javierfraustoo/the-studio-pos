import React, { useEffect, useState, useCallback, useRef } from 'react';
import socket from '../socket';
import type { KdsItem } from '../api';
import { fetchKdsItems, fetchKdsHistory, updateKdsItem } from '../api';
import WasteModal from './WasteModal';

// ─── Timer hook (5s interval, no seconds needed) ────────────────────────────

function useTimer() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function getSlaColor(minutes: number) {
  if (minutes >= 10) return { bg: '#FEE2E2', border: '#EF4444', label: 'URGENTE' };
  if (minutes >= 5) return { bg: '#FEF3C7', border: '#F59E0B', label: 'ATENCION' };
  return { bg: '#D1FAE5', border: '#10B981', label: '' };
}

// ─── Undo Toast ─────────────────────────────────────────────────────────────

interface UndoAction { itemId: string; previousStatus: string; itemName: string; }

function UndoToast({ action, onUndo, onDismiss }: { action: UndoAction; onUndo: () => void; onDismiss: () => void }) {
  const [timeLeft, setTimeLeft] = useState(5);

  useEffect(() => {
    if (timeLeft <= 0) { onDismiss(); return; }
    const t = setTimeout(() => setTimeLeft(timeLeft - 1), 1000);
    return () => clearTimeout(t);
  }, [timeLeft]);

  return (
    <div style={toastStyles.container}>
      <div style={toastStyles.content}>
        <span style={toastStyles.text}>"{action.itemName}" marcado</span>
        <button onClick={onUndo} style={toastStyles.undoBtn}>DESHACER ({timeLeft}s)</button>
        <button onClick={onDismiss} style={toastStyles.closeBtn}>✕</button>
      </div>
    </div>
  );
}

const toastStyles: Record<string, React.CSSProperties> = {
  container: { position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 300, animation: 'slideUp 0.3s ease' },
  content: { display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', backgroundColor: '#1F2937', borderRadius: 12, boxShadow: '0 10px 40px rgba(0,0,0,0.4)' },
  text: { color: '#FFF', fontSize: 14, fontWeight: 500 },
  undoBtn: { padding: '6px 16px', borderRadius: 8, border: '2px solid #FCD34D', backgroundColor: 'transparent', color: '#FCD34D', fontWeight: 800, fontSize: 13, cursor: 'pointer', letterSpacing: 0.5 },
  closeBtn: { background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer', fontSize: 16, padding: '0 4px' },
};

// ─── Main KDS View ──────────────────────────────────────────────────────────

export default function KDSView({ station, title }: { station: string; title: string }) {
  const [items, setItems] = useState<KdsItem[]>([]);
  const [historyItems, setHistoryItems] = useState<KdsItem[]>([]);
  const [showWaste, setShowWaste] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [undoAction, setUndoAction] = useState<UndoAction | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const now = useTimer();

  // Stable fetch that won't cause loops
  const loadItems = useCallback(() => {
    fetchKdsItems(station).then(setItems).catch(console.error);
  }, [station]);

  const loadHistory = useCallback(() => {
    fetchKdsHistory(station).then(setHistoryItems).catch(console.error);
  }, [station]);

  // Initial load + socket setup — runs once per station
  useEffect(() => {
    loadItems();
    socket.emit('kds:join', station);

    const onNew = (item: KdsItem) => {
      if (item.station !== station) return;
      setItems((prev) => prev.some((k) => k.id === item.id) ? prev : [...prev, item]);
    };

    const onUpdated = (item: KdsItem) => {
      if (item.station !== station) return;
      setItems((prev) => {
        if (item.status === 'delivered') {
          return prev.filter((k) => k.id !== item.id);
        }
        // If item was delivered but now reverted (undo), add it back
        const exists = prev.some(k => k.id === item.id);
        if (exists) {
          return prev.map((k) => k.id === item.id ? item : k);
        }
        // Item was in delivered state, add back to active
        return [...prev, item];
      });
    };

    socket.on('kds:new-item', onNew);
    socket.on('kds:item-updated', onUpdated);

    return () => {
      socket.off('kds:new-item', onNew);
      socket.off('kds:item-updated', onUpdated);
    };
  }, [station, loadItems]);

  // Optimistic mark ready
  const handleReady = useCallback(async (id: string) => {
    const item = items.find(i => i.id === id);
    if (!item) return;

    // Optimistic update
    setItems(prev => prev.map(k => k.id === id ? { ...k, status: 'ready', ready_at: new Date().toISOString() } : k));

    // Show undo toast
    setUndoAction({ itemId: id, previousStatus: item.status, itemName: item.product_name });

    try {
      await updateKdsItem(id, 'ready');
    } catch {
      // Revert on error
      setItems(prev => prev.map(k => k.id === id ? item : k));
      setUndoAction(null);
    }
  }, [items]);

  // Optimistic mark delivered
  const handleDelivered = useCallback(async (id: string) => {
    const item = items.find(i => i.id === id);
    if (!item) return;

    // Optimistic: remove from active
    setItems(prev => prev.filter(k => k.id !== id));

    // Show undo toast
    setUndoAction({ itemId: id, previousStatus: item.status, itemName: item.product_name });

    try {
      await updateKdsItem(id, 'delivered');
    } catch {
      // Revert on error — add back
      setItems(prev => [...prev, item]);
      setUndoAction(null);
    }
  }, [items]);

  // Undo handler
  const handleUndo = useCallback(async () => {
    if (!undoAction) return;
    const { itemId, previousStatus } = undoAction;
    setUndoAction(null);

    try {
      await updateKdsItem(itemId, previousStatus);
      // Socket event will handle re-adding the item
    } catch (e) {
      console.error('Undo failed:', e);
    }
  }, [undoAction]);

  const pending = items.filter((i) => i.status === 'pending' || i.status === 'in_progress');
  const ready = items.filter((i) => i.status === 'ready');
  const all = [...pending.sort((a, b) => new Date(a.routed_at).getTime() - new Date(b.routed_at).getTime()), ...ready];

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <span style={styles.title}>{title}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => { setShowHistory(!showHistory); if (!showHistory) loadHistory(); }}
            style={{ ...styles.historyBtn, backgroundColor: showHistory ? '#374151' : 'transparent' }}>
            {showHistory ? 'Pendientes' : 'Historial'}
          </button>
          <button onClick={() => setShowWaste(true)} style={styles.wasteBtn}>
            Registrar Merma
          </button>
          <span style={styles.count}>{pending.length} pendiente{pending.length !== 1 ? 's' : ''}</span>
        </div>
      </header>

      {showHistory ? (
        // ─── History View ─────────────────────────────────────────
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          <h3 style={{ color: '#9CA3AF', fontSize: 14, fontWeight: 600, margin: '0 0 16px', textTransform: 'uppercase', letterSpacing: 1 }}>
            Pedidos Entregados Hoy ({historyItems.length})
          </h3>
          {historyItems.length === 0 ? (
            <div style={styles.empty}>Sin pedidos entregados hoy</div>
          ) : (
            <div style={styles.grid}>
              {historyItems.map((item) => {
                const deliveredAt = item.delivered_at ? new Date(item.delivered_at) : null;
                const routedAt = new Date(item.routed_at);
                const prepMins = deliveredAt ? Math.floor((deliveredAt.getTime() - routedAt.getTime()) / 60000) : 0;
                return (
                  <div key={item.id} style={{ ...styles.card, backgroundColor: '#F3F4F6', borderColor: '#D1D5DB', opacity: 0.85 }}>
                    <div style={styles.cardHeader}>
                      <div>
                        <span style={styles.orderNum}>#{item.order_number}</span>
                        <span style={styles.orderType}>
                          {item.order_type === 'to_go' ? 'LLEVAR' : 'MESA'}
                        </span>
                      </div>
                      <span style={{ fontSize: 13, color: '#6B7280', fontWeight: 600 }}>
                        {prepMins} min prep
                      </span>
                    </div>
                    <div style={styles.product}>
                      <span style={{ ...styles.qty, color: '#6B7280' }}>{item.quantity}x</span>
                      <span style={{ ...styles.name, color: '#6B7280' }}>{item.product_name}</span>
                    </div>
                    {item.modifiers.length > 0 && (
                      <div style={styles.mods}>
                        {item.modifiers.map((m, i) => <span key={i} style={styles.modTag}>{m}</span>)}
                      </div>
                    )}
                    <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 4 }}>
                      Entregado: {deliveredAt?.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        // ─── Active Orders View ──────────────────────────────────
        all.length === 0 ? (
          <div style={styles.empty}>Sin ordenes pendientes</div>
        ) : (
          <div style={styles.grid}>
            {all.map((item) => {
              const elapsed = now - new Date(item.routed_at).getTime();
              const mins = Math.floor(elapsed / 60000);
              const isReady = item.status === 'ready';
              const sla = getSlaColor(mins);

              return (
                <div key={item.id} style={{
                  ...styles.card,
                  backgroundColor: isReady ? '#EFF6FF' : sla.bg,
                  borderColor: isReady ? '#3B82F6' : sla.border,
                }}>
                  <div style={styles.cardHeader}>
                    <div>
                      <span style={styles.orderNum}>#{item.order_number}</span>
                      <span style={styles.orderType}>
                        {item.order_type === 'to_go' ? 'LLEVAR' : 'MESA'}
                      </span>
                    </div>
                    <span style={{ ...styles.timer, color: isReady ? '#3B82F6' : sla.border }}>
                      {isReady ? 'LISTO' : `${mins} min`}
                    </span>
                  </div>

                  {item.customer_name && <p style={styles.customer}>{item.customer_name}</p>}

                  {!isReady && sla.label && (
                    <div style={{ ...styles.slaBadge, backgroundColor: sla.border }}>{sla.label}</div>
                  )}

                  <div style={styles.product}>
                    <span style={styles.qty}>{item.quantity}x</span>
                    <span style={styles.name}>{item.product_name}</span>
                  </div>

                  {item.modifiers.length > 0 && (
                    <div style={styles.mods}>
                      {item.modifiers.map((m, i) => (
                        <span key={i} style={styles.modTag}>{m}</span>
                      ))}
                    </div>
                  )}

                  {item.notes && <p style={styles.notes}>{item.notes}</p>}

                  {item.status !== 'ready' && (
                    <button onClick={() => handleReady(item.id)} style={{ ...styles.actionBtn, backgroundColor: '#059669' }}>
                      LISTO
                    </button>
                  )}
                  {item.status === 'ready' && (
                    <button onClick={() => handleDelivered(item.id)} style={{ ...styles.actionBtn, backgroundColor: '#3B82F6' }}>
                      ENTREGADO
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )
      )}

      {/* Undo Toast */}
      {undoAction && (
        <UndoToast
          action={undoAction}
          onUndo={handleUndo}
          onDismiss={() => setUndoAction(null)}
        />
      )}

      <WasteModal open={showWaste} onClose={() => setShowWaste(false)} station={station} />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { height: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#111827', fontFamily: "'Inter', system-ui, sans-serif" },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 24px', backgroundColor: '#1F2937' },
  title: { fontSize: 20, fontWeight: 800, color: '#FFF' },
  count: { fontSize: 14, color: '#9CA3AF', fontWeight: 500 },
  wasteBtn: { padding: '8px 16px', borderRadius: 8, border: '2px solid #DC2626', backgroundColor: 'transparent', color: '#FCA5A5', fontWeight: 700, fontSize: 13, cursor: 'pointer' },
  historyBtn: { padding: '8px 16px', borderRadius: 8, border: '2px solid #6B7280', color: '#D1D5DB', fontWeight: 700, fontSize: 13, cursor: 'pointer' },
  empty: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6B7280', fontSize: 18 },
  grid: { flex: 1, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16, padding: 20, overflowY: 'auto', alignContent: 'start' },
  card: { borderRadius: 16, border: '3px solid', padding: 16, display: 'flex', flexDirection: 'column', gap: 8 },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  orderNum: { fontSize: 22, fontWeight: 800, color: '#111827' },
  orderType: { fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4, backgroundColor: '#E5E7EB', color: '#374151', marginLeft: 8 },
  timer: { fontSize: 28, fontWeight: 800, fontFamily: 'monospace' },
  customer: { fontSize: 14, fontWeight: 600, color: '#374151', margin: 0 },
  slaBadge: { alignSelf: 'flex-start', color: '#FFF', fontSize: 11, fontWeight: 800, padding: '3px 10px', borderRadius: 6, letterSpacing: 1 },
  product: { display: 'flex', gap: 8, alignItems: 'baseline' },
  qty: { fontSize: 20, fontWeight: 800, color: '#1F2937' },
  name: { fontSize: 18, fontWeight: 700, color: '#1F2937' },
  mods: { display: 'flex', flexWrap: 'wrap', gap: 4 },
  modTag: { fontSize: 12, backgroundColor: 'rgba(0,0,0,0.08)', padding: '3px 8px', borderRadius: 6, fontWeight: 600, color: '#374151' },
  notes: { fontSize: 13, color: '#D97706', fontStyle: 'italic', fontWeight: 600, margin: 0, padding: '4px 8px', backgroundColor: '#FFFBEB', borderRadius: 6 },
  actionBtn: { width: '100%', padding: '14px 0', borderRadius: 12, border: 'none', color: '#FFF', fontSize: 16, fontWeight: 800, cursor: 'pointer', letterSpacing: 1, marginTop: 4 },
};
