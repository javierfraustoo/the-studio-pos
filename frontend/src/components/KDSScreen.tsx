import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useStore } from '../store/useStore';
import * as api from '../api';
import type { KdsItem } from '../api';

function getSlaColor(minutes: number) {
  if (minutes >= 10) return { bg: '#FEE2E2', border: '#EF4444', label: 'URGENTE' };
  if (minutes >= 5) return { bg: '#FEF3C7', border: '#F59E0B', label: 'ATENCION' };
  return { bg: '#D1FAE5', border: '#10B981', label: '' };
}

function useTimer() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(id);
  }, []);
  return now;
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
    <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 300 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 18px', backgroundColor: '#1F2937', borderRadius: 10, boxShadow: '0 8px 30px rgba(0,0,0,0.3)' }}>
        <span style={{ color: '#FFF', fontSize: 13, fontWeight: 500 }}>"{action.itemName}" marcado</span>
        <button onClick={onUndo} style={{ padding: '5px 14px', borderRadius: 6, border: '2px solid #FCD34D', backgroundColor: 'transparent', color: '#FCD34D', fontWeight: 800, fontSize: 12, cursor: 'pointer' }}>DESHACER ({timeLeft}s)</button>
        <button onClick={onDismiss} style={{ background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer', fontSize: 14 }}>✕</button>
      </div>
    </div>
  );
}

// ─── KDS Item Card ──────────────────────────────────────────────────────────

function KdsItemCard({
  item, now, onMarkReady, onMarkDelivered, userRole,
}: {
  item: KdsItem; now: number;
  onMarkReady: (id: string) => void;
  onMarkDelivered: (id: string) => void;
  userRole: string;
}) {
  const elapsed = now - new Date(item.routed_at).getTime();
  const mins = Math.floor(elapsed / 60000);
  const sla = getSlaColor(mins);
  const isReady = item.status === 'ready';

  return (
    <div style={{
      ...styles.kdsCard,
      backgroundColor: isReady ? '#EFF6FF' : sla.bg,
      borderColor: isReady ? '#3B82F6' : sla.border,
    }}>
      <div style={styles.kdsCardHeader}>
        <div style={styles.kdsOrderInfo}>
          <span style={styles.kdsOrderNum}>#{item.order_number}</span>
          <span style={styles.kdsOrderType}>
            {item.order_type === 'to_go' ? 'LLEVAR' : 'MESA'}
          </span>
        </div>
        <div style={{ ...styles.kdsTimer, color: isReady ? '#3B82F6' : sla.border }}>
          {isReady ? 'LISTO' : `${mins} min`}
        </div>
      </div>

      {item.customer_name && <p style={styles.kdsCustomer}>{item.customer_name}</p>}

      {!isReady && sla.label && (
        <div style={{ ...styles.slaBadge, backgroundColor: sla.border }}>{sla.label}</div>
      )}

      <div style={styles.kdsProduct}>
        <span style={styles.kdsQty}>{item.quantity}x</span>
        <span style={styles.kdsName}>{item.product_name}</span>
      </div>

      {item.modifiers.length > 0 && (
        <div style={styles.kdsModifiers}>
          {item.modifiers.map((m, i) => (
            <span key={i} style={styles.kdsModTag}>{m}</span>
          ))}
        </div>
      )}

      {item.notes && <p style={styles.kdsNotes}>{item.notes}</p>}

      {/* Cashier: ONLY "Entregado" (when item is ready). Barista/Kitchen/Admin/Manager: both buttons */}
      {item.status !== 'ready' && userRole !== 'cashier' && (
        <button onClick={() => onMarkReady(item.id)}
          style={{ ...styles.kdsActionBtn, backgroundColor: '#059669' }}>
          LISTO
        </button>
      )}
      {item.status === 'ready' && (
        <button onClick={() => onMarkDelivered(item.id)}
          style={{ ...styles.kdsActionBtn, backgroundColor: '#3B82F6' }}>
          ENTREGADO
        </button>
      )}
    </div>
  );
}

// ─── Main KDS Screen ────────────────────────────────────────────────────────

export default function KDSScreen() {
  const { kdsItems, fetchKdsItems, currentUser } = useStore();
  const userRole = currentUser?.role || 'cashier';
  const now = useTimer();
  const [activeStation, setActiveStation] = useState<'bar' | 'kitchen'>('bar');
  const [showHistory, setShowHistory] = useState(false);
  const [historyItems, setHistoryItems] = useState<KdsItem[]>([]);
  const [undoAction, setUndoAction] = useState<UndoAction | null>(null);

  // Stable ref for station to avoid loops
  const stationRef = useRef(activeStation);
  stationRef.current = activeStation;

  // Fetch on station change ONLY
  useEffect(() => {
    fetchKdsItems(activeStation);
  }, [activeStation]); // eslint-disable-line

  const loadHistory = useCallback(async () => {
    const items = await api.fetchKdsHistory(activeStation);
    setHistoryItems(items);
  }, [activeStation]);

  const stationItems = kdsItems
    .filter((i) => i.station === activeStation && i.status !== 'delivered')
    .sort((a, b) => new Date(a.routed_at).getTime() - new Date(b.routed_at).getTime());

  // Optimistic mark ready
  const handleMarkReady = useCallback(async (id: string) => {
    const item = kdsItems.find(k => k.id === id);
    if (!item) return;

    // Optimistic update in store
    useStore.getState().updateKdsItemLocal({ ...item, status: 'ready', ready_at: new Date().toISOString() });
    setUndoAction({ itemId: id, previousStatus: item.status, itemName: item.product_name });

    try {
      await api.updateKdsItem(id, 'ready');
    } catch {
      // Revert
      useStore.getState().updateKdsItemLocal(item);
      setUndoAction(null);
    }
  }, [kdsItems]);

  // Optimistic mark delivered
  const handleMarkDelivered = useCallback(async (id: string) => {
    const item = kdsItems.find(k => k.id === id);
    if (!item) return;

    // Optimistic: mark as delivered (will be filtered out by stationItems)
    useStore.getState().updateKdsItemLocal({ ...item, status: 'delivered' });
    setUndoAction({ itemId: id, previousStatus: item.status, itemName: item.product_name });

    try {
      await api.updateKdsItem(id, 'delivered');
    } catch {
      // Revert
      useStore.getState().updateKdsItemLocal(item);
      setUndoAction(null);
    }
  }, [kdsItems]);

  // Undo
  const handleUndo = useCallback(async () => {
    if (!undoAction) return;
    setUndoAction(null);
    try {
      const result = await api.updateKdsItem(undoAction.itemId, undoAction.previousStatus);
      // Socket will handle state sync
    } catch (e) {
      console.error('Undo failed:', e);
    }
  }, [undoAction]);

  const pendingCount = stationItems.filter((i) => i.status !== 'ready').length;
  const readyCount = stationItems.filter((i) => i.status === 'ready').length;

  return (
    <div style={styles.kdsContainer}>
      <div style={styles.kdsTabBar}>
        <button onClick={() => { setActiveStation('bar'); setShowHistory(false); }}
          style={{ ...styles.kdsTab, backgroundColor: activeStation === 'bar' ? '#78350F' : '#F3F4F6', color: activeStation === 'bar' ? '#FFF' : '#374151' }}>
          KDS Barra
          {activeStation === 'bar' && pendingCount > 0 && <span style={styles.kdsBadge}>{pendingCount}</span>}
        </button>
        <button onClick={() => { setActiveStation('kitchen'); setShowHistory(false); }}
          style={{ ...styles.kdsTab, backgroundColor: activeStation === 'kitchen' ? '#065F46' : '#F3F4F6', color: activeStation === 'kitchen' ? '#FFF' : '#374151' }}>
          KDS Cocina
          {activeStation === 'kitchen' && pendingCount > 0 && <span style={styles.kdsBadge}>{pendingCount}</span>}
        </button>

        <button onClick={() => { setShowHistory(!showHistory); if (!showHistory) loadHistory(); }}
          style={{ ...styles.kdsTab, backgroundColor: showHistory ? '#374151' : '#F3F4F6', color: showHistory ? '#FFF' : '#374151' }}>
          {showHistory ? 'Pendientes' : 'Historial'}
        </button>

        <div style={styles.kdsStats}>
          <span style={styles.kdsStat}>
            <span style={{ ...styles.kdsStatDot, backgroundColor: '#F59E0B' }} /> Pendientes: {pendingCount}
          </span>
          <span style={styles.kdsStat}>
            <span style={{ ...styles.kdsStatDot, backgroundColor: '#3B82F6' }} /> Listos: {readyCount}
          </span>
        </div>
      </div>

      <div style={styles.slaLegend}>
        <span style={styles.slaItem}><span style={{ ...styles.slaBox, backgroundColor: '#D1FAE5', borderColor: '#10B981' }} /> {'< 5 min'}</span>
        <span style={styles.slaItem}><span style={{ ...styles.slaBox, backgroundColor: '#FEF3C7', borderColor: '#F59E0B' }} /> {'5-10 min'}</span>
        <span style={styles.slaItem}><span style={{ ...styles.slaBox, backgroundColor: '#FEE2E2', borderColor: '#EF4444' }} /> {'> 10 min'}</span>
      </div>

      {showHistory ? (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <h4 style={{ margin: '0 0 12px', color: '#6B7280', fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>
            Entregados Hoy ({historyItems.length})
          </h4>
          {historyItems.length === 0 ? (
            <div style={styles.kdsEmpty}>
              <p>Sin pedidos entregados hoy</p>
            </div>
          ) : (
            <div style={styles.kdsGrid}>
              {historyItems.map(item => {
                const delivered = item.delivered_at ? new Date(item.delivered_at) : null;
                const routed = new Date(item.routed_at);
                const prepMins = delivered ? Math.floor((delivered.getTime() - routed.getTime()) / 60000) : 0;
                return (
                  <div key={item.id} style={{ ...styles.kdsCard, backgroundColor: '#F9FAFB', borderColor: '#D1D5DB', opacity: 0.8 }}>
                    <div style={styles.kdsCardHeader}>
                      <div style={styles.kdsOrderInfo}>
                        <span style={{ ...styles.kdsOrderNum, fontSize: 16 }}>#{item.order_number}</span>
                        <span style={styles.kdsOrderType}>{item.order_type === 'to_go' ? 'LLEVAR' : 'MESA'}</span>
                      </div>
                      <span style={{ fontSize: 12, color: '#6B7280', fontWeight: 600 }}>{prepMins} min</span>
                    </div>
                    <div style={styles.kdsProduct}>
                      <span style={{ ...styles.kdsQty, fontSize: 14, color: '#6B7280' }}>{item.quantity}x</span>
                      <span style={{ ...styles.kdsName, fontSize: 14, color: '#6B7280' }}>{item.product_name}</span>
                    </div>
                    <div style={{ fontSize: 11, color: '#9CA3AF' }}>
                      {delivered?.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : stationItems.length === 0 ? (
        <div style={styles.kdsEmpty}>
          <span style={styles.kdsEmptyIcon}>{activeStation === 'bar' ? '\u2615' : '\u{1F373}'}</span>
          <p>Sin ordenes pendientes en {activeStation === 'bar' ? 'barra' : 'cocina'}</p>
        </div>
      ) : (
        <div style={styles.kdsGrid}>
          {stationItems.map((item) => (
            <KdsItemCard key={item.id} item={item} now={now} userRole={userRole}
              onMarkReady={handleMarkReady} onMarkDelivered={handleMarkDelivered} />
          ))}
        </div>
      )}

      {undoAction && (
        <UndoToast action={undoAction} onUndo={handleUndo} onDismiss={() => setUndoAction(null)} />
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  kdsContainer: { height: '100%', display: 'flex', flexDirection: 'column', padding: 20, overflowY: 'auto' },
  kdsTabBar: { display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' },
  kdsTab: { padding: '10px 20px', borderRadius: 10, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8, transition: 'all 0.15s' },
  kdsBadge: { backgroundColor: '#EF4444', color: '#FFF', fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 10 },
  kdsStats: { marginLeft: 'auto', display: 'flex', gap: 16 },
  kdsStat: { fontSize: 13, color: '#6B7280', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 500 },
  kdsStatDot: { width: 8, height: 8, borderRadius: 4 },
  slaLegend: { display: 'flex', gap: 16, marginBottom: 16, padding: '8px 12px', backgroundColor: '#F9FAFB', borderRadius: 8 },
  slaItem: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#6B7280' },
  slaBox: { width: 16, height: 16, borderRadius: 4, border: '2px solid' },
  kdsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16, flex: 1 },
  kdsCard: { borderRadius: 16, border: '3px solid', padding: 16, display: 'flex', flexDirection: 'column', gap: 8, transition: 'all 0.3s ease' },
  kdsCardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  kdsOrderInfo: { display: 'flex', alignItems: 'center', gap: 8 },
  kdsOrderNum: { fontSize: 22, fontWeight: 800, color: '#111827' },
  kdsOrderType: { fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4, backgroundColor: '#E5E7EB', color: '#374151' },
  kdsTimer: { fontSize: 28, fontWeight: 800, fontFamily: 'monospace' },
  kdsCustomer: { fontSize: 14, fontWeight: 600, color: '#374151', margin: 0 },
  slaBadge: { alignSelf: 'flex-start', color: '#FFF', fontSize: 11, fontWeight: 800, padding: '3px 10px', borderRadius: 6, letterSpacing: 1 },
  kdsProduct: { display: 'flex', gap: 8, alignItems: 'baseline' },
  kdsQty: { fontSize: 20, fontWeight: 800, color: '#1F2937' },
  kdsName: { fontSize: 18, fontWeight: 700, color: '#1F2937' },
  kdsModifiers: { display: 'flex', flexWrap: 'wrap', gap: 4 },
  kdsModTag: { fontSize: 12, backgroundColor: 'rgba(0,0,0,0.08)', padding: '3px 8px', borderRadius: 6, fontWeight: 600, color: '#374151' },
  kdsNotes: { fontSize: 13, color: '#D97706', fontStyle: 'italic', fontWeight: 600, margin: 0, padding: '4px 8px', backgroundColor: '#FFFBEB', borderRadius: 6 },
  kdsActionBtn: { width: '100%', padding: '14px 0', borderRadius: 12, border: 'none', color: '#FFF', fontSize: 16, fontWeight: 800, cursor: 'pointer', letterSpacing: 1, marginTop: 4 },
  kdsEmpty: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#9CA3AF' },
  kdsEmptyIcon: { fontSize: 48, marginBottom: 12 },
};
