import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useStore } from '../store/useStore';
import * as api from '../api';
import type { KdsItem } from '../api';

function getSlaColor(minutes: number) {
  if (minutes >= 10) return { bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.4)', text: '#EF4444', label: 'URGENTE' };
  if (minutes >= 5) return { bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.4)', text: '#F59E0B', label: 'ATENCIÓN' };
  return { bg: 'rgba(16,185,129,0.06)', border: 'rgba(16,185,129,0.25)', text: '#10B981', label: '' };
}

function useTimer() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  return now;
}

function formatElapsed(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60), s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

interface UndoAction { itemId: string; previousStatus: string; itemName: string; }

function UndoToast({ action, onUndo, onDismiss }: { action: UndoAction; onUndo: () => void; onDismiss: () => void }) {
  const [timeLeft, setTimeLeft] = useState(5);
  useEffect(() => { if (timeLeft <= 0) { onDismiss(); return; } const t = setTimeout(() => setTimeLeft(timeLeft - 1), 1000); return () => clearTimeout(t); }, [timeLeft]);
  return (
    <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 300, animation: 'slideUp 0.3s ease-out' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 18px', backgroundColor: 'var(--bg-card)', borderRadius: 14, boxShadow: '0 12px 40px var(--shadow-lg)', border: '1px solid var(--border)' }}>
        <span style={{ color: 'var(--text-primary)', fontSize: 13, fontWeight: 500 }}>"{action.itemName}" marcado</span>
        <button onClick={onUndo} style={{ padding: '5px 14px', borderRadius: 8, border: '1.5px solid rgba(16,185,129,0.4)', backgroundColor: 'transparent', color: '#10B981', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>DESHACER ({timeLeft}s)</button>
        <button onClick={onDismiss} style={{ background: 'none', border: 'none', color: 'var(--text-faint)', cursor: 'pointer', fontSize: 14 }}>✕</button>
      </div>
    </div>
  );
}

function KdsItemCard({ item, now, onMarkReady, onMarkDelivered, userRole, operatorType }: {
  item: KdsItem; now: number; onMarkReady: (id: string) => void; onMarkDelivered: (id: string) => void; userRole: string; operatorType: string;
}) {
  const elapsed = now - new Date(item.routed_at).getTime();
  const mins = Math.floor(elapsed / 60000);
  const sla = getSlaColor(mins);
  const isReady = item.status === 'ready';

  return (
    <div style={{
      borderRadius: 14, border: `2px solid ${isReady ? 'rgba(59,130,246,0.3)' : sla.border}`,
      backgroundColor: isReady ? 'rgba(59,130,246,0.06)' : sla.bg,
      padding: 12, display: 'flex', flexDirection: 'column' as const, gap: 4,
      transition: 'all 0.3s ease',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)' }}>#{item.order_number}</span>
          <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 4, backgroundColor: 'var(--bg-hover)', color: 'var(--text-muted)' }}>
            {item.order_type === 'to_go' ? 'LLEVAR' : 'MESA'}
          </span>
        </div>
        <span style={{ fontSize: 20, fontWeight: 800, fontFamily: 'monospace', fontVariantNumeric: 'tabular-nums' as const, color: isReady ? '#3B82F6' : sla.text }}>
          {isReady ? 'LISTO' : formatElapsed(elapsed)}
        </span>
      </div>

      {item.customer_name && <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', margin: 0 }}>{item.customer_name}</p>}
      {!isReady && sla.label && <div style={{ alignSelf: 'flex-start', fontSize: 9, fontWeight: 800, padding: '1px 6px', borderRadius: 4, backgroundColor: sla.text, color: '#FFF', letterSpacing: '0.05em' }}>{sla.label}</div>}

      <div style={{ display: 'flex', gap: 5, alignItems: 'baseline' }}>
        <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)' }}>{item.quantity}x</span>
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-secondary)' }}>{item.product_name}</span>
      </div>

      {item.modifiers.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 3 }}>
          {item.modifiers.map((m, i) => <span key={i} style={{ fontSize: 10, backgroundColor: 'var(--bg-hover)', padding: '1px 5px', borderRadius: 4, fontWeight: 600, color: 'var(--text-muted)' }}>{m}</span>)}
        </div>
      )}

      {item.notes && <p style={{ fontSize: 11, color: '#F59E0B', fontStyle: 'italic', fontWeight: 600, margin: 0, padding: '2px 6px', backgroundColor: 'rgba(245,158,11,0.08)', borderRadius: 4 }}>{item.notes}</p>}

      {item.status !== 'ready' && !(userRole === 'operador' && operatorType === 'cajero') && (
        <button onClick={() => onMarkReady(item.id)}
          style={{ width: '100%', padding: '8px 0', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #059669, #10B981)', color: '#FFF', fontSize: 13, fontWeight: 800, cursor: 'pointer', marginTop: 2 }}>
          LISTO
        </button>
      )}
      {item.status === 'ready' && (
        <button onClick={() => onMarkDelivered(item.id)}
          style={{ width: '100%', padding: '8px 0', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #2563EB, #3B82F6)', color: '#FFF', fontSize: 13, fontWeight: 800, cursor: 'pointer', marginTop: 2 }}>
          ENTREGADO
        </button>
      )}
    </div>
  );
}

// ─── Single Station Panel (used in dual view) ───────────────────────────

function StationPanel({ station, title, color, items, now, userRole, operatorType, onMarkReady, onMarkDelivered }: {
  station: string; title: string; color: string;
  items: KdsItem[]; now: number; userRole: string; operatorType: string;
  onMarkReady: (id: string) => void; onMarkDelivered: (id: string) => void;
}) {
  const pending = items.filter(i => i.status !== 'ready').length;
  const ready = items.filter(i => i.status === 'ready').length;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border)', overflow: 'hidden' }}>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color }}>● {title}</span>
          {pending > 0 && <span style={{ fontSize: 10, fontWeight: 700, backgroundColor: '#EF4444', color: '#FFF', padding: '1px 6px', borderRadius: 10 }}>{pending}</span>}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{pending} pend. · {ready} listos</span>
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 10 }}>
        {items.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-faint)', fontSize: 13 }}>
            Sin órdenes
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8, alignContent: 'start' }}>
            {items.map(item => (
              <KdsItemCard key={item.id} item={item} now={now} userRole={userRole} operatorType={operatorType}
                onMarkReady={onMarkReady} onMarkDelivered={onMarkDelivered} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main KDS Screen ────────────────────────────────────────────────────

export default function KDSScreen() {
  const { kdsItems, fetchKdsItems, currentUser } = useStore();
  const userRole = currentUser?.role || 'operador';
  const operatorType = (currentUser as any)?.operator_type || 'cajero';
  const now = useTimer();
  const [showHistory, setShowHistory] = useState(false);
  const [historyStation, setHistoryStation] = useState<'bar' | 'kitchen'>('bar');
  const [historyItems, setHistoryItems] = useState<KdsItem[]>([]);
  const [undoAction, setUndoAction] = useState<UndoAction | null>(null);
  const [barItems, setBarItems] = useState<KdsItem[]>([]);
  const [kitchenItems, setKitchenItems] = useState<KdsItem[]>([]);

  // Fetch both stations
  const loadAll = useCallback(async () => {
    const [bar, kitchen] = await Promise.all([api.fetchKdsItems('bar'), api.fetchKdsItems('kitchen')]);
    setBarItems(bar);
    setKitchenItems(kitchen);
  }, []);

  useEffect(() => { loadAll(); }, []);

  // Also keep store in sync for the active station
  useEffect(() => {
    const interval = setInterval(loadAll, 15000);
    return () => clearInterval(interval);
  }, []);

  const loadHistory = useCallback(async (st: 'bar' | 'kitchen') => {
    setHistoryStation(st);
    setHistoryItems(await api.fetchKdsHistory(st));
  }, []);

  const allActive = [...barItems.filter(i => i.status !== 'delivered'), ...kitchenItems.filter(i => i.status !== 'delivered')];

  const handleMarkReady = useCallback(async (id: string) => {
    const item = allActive.find(k => k.id === id);
    if (!item) return;
    // Optimistic update in local state
    const updateFn = (prev: KdsItem[]) => prev.map(k => k.id === id ? { ...k, status: 'ready', ready_at: new Date().toISOString() } : k);
    if (item.station === 'bar') setBarItems(updateFn); else setKitchenItems(updateFn);
    setUndoAction({ itemId: id, previousStatus: item.status, itemName: item.product_name });
    try { await api.updateKdsItem(id, 'ready'); } catch { loadAll(); setUndoAction(null); }
  }, [allActive]);

  const handleMarkDelivered = useCallback(async (id: string) => {
    const item = allActive.find(k => k.id === id);
    if (!item) return;
    const updateFn = (prev: KdsItem[]) => prev.filter(k => k.id !== id);
    if (item.station === 'bar') setBarItems(updateFn); else setKitchenItems(updateFn);
    setUndoAction({ itemId: id, previousStatus: item.status, itemName: item.product_name });
    try { await api.updateKdsItem(id, 'delivered'); } catch { loadAll(); setUndoAction(null); }
  }, [allActive]);

  const handleUndo = useCallback(async () => {
    if (!undoAction) return;
    setUndoAction(null);
    try { await api.updateKdsItem(undoAction.itemId, undoAction.previousStatus); loadAll(); } catch (e) { console.error('Undo failed:', e); }
  }, [undoAction]);

  const activeBar = barItems.filter(i => i.status !== 'delivered').sort((a, b) => new Date(a.routed_at).getTime() - new Date(b.routed_at).getTime());
  const activeKitchen = kitchenItems.filter(i => i.status !== 'delivered').sort((a, b) => new Date(a.routed_at).getTime() - new Date(b.routed_at).getTime());

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg-primary)' }}>
      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 6, padding: '10px 16px', borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginRight: 8 }}>KDS</span>
        <button onClick={() => { setShowHistory(true); loadHistory('bar'); }}
          style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid var(--border)', backgroundColor: showHistory && historyStation === 'bar' ? 'var(--bg-hover)' : 'transparent', color: 'var(--text-muted)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
          Historial Barra
        </button>
        <button onClick={() => { setShowHistory(true); loadHistory('kitchen'); }}
          style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid var(--border)', backgroundColor: showHistory && historyStation === 'kitchen' ? 'var(--bg-hover)' : 'transparent', color: 'var(--text-muted)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
          Historial Cocina
        </button>
        {showHistory && (
          <button onClick={() => setShowHistory(false)}
            style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid var(--accent)', backgroundColor: 'var(--accent-glow)', color: 'var(--accent)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
            ← Vista en vivo
          </button>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, fontSize: 11, color: 'var(--text-faint)' }}>
          <span>Barra: {activeBar.length}</span>
          <span>Cocina: {activeKitchen.length}</span>
        </div>
      </div>

      {showHistory ? (
        /* ─── History View ─── */
        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          <h4 style={{ margin: '0 0 12px', color: 'var(--text-faint)', fontSize: 12, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.08em' }}>
            Entregados Hoy — {historyStation === 'bar' ? 'Barra' : 'Cocina'} ({historyItems.length})
          </h4>
          {historyItems.length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: 'var(--text-faint)' }}>Sin entregas hoy</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
              {historyItems.map(item => {
                const d = item.delivered_at ? new Date(item.delivered_at) : null;
                const r = new Date(item.routed_at);
                const pm = d ? Math.floor((d.getTime() - r.getTime()) / 60000) : 0;
                return (
                  <div key={item.id} style={{ borderRadius: 12, border: '1px solid var(--border)', backgroundColor: 'var(--bg-card)', padding: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)' }}>#{item.order_number}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: pm > 10 ? '#EF4444' : pm > 5 ? '#F59E0B' : '#10B981' }}>{pm} min</span>
                    </div>
                    {item.customer_name && <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '2px 0 0', fontWeight: 500 }}>{item.customer_name}</p>}
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', marginTop: 6 }}>{item.quantity}x {item.product_name}</div>
                    {item.modifiers.length > 0 && (
                      <div style={{ display: 'flex', gap: 3, marginTop: 4, flexWrap: 'wrap' as const }}>
                        {item.modifiers.map((m, i) => <span key={i} style={{ fontSize: 10, backgroundColor: 'var(--bg-hover)', padding: '1px 5px', borderRadius: 4, color: 'var(--text-muted)' }}>{m}</span>)}
                      </div>
                    )}
                    {item.notes && <p style={{ fontSize: 10, color: '#F59E0B', margin: '4px 0 0', fontStyle: 'italic' }}>{item.notes}</p>}
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, paddingTop: 6, borderTop: '1px solid var(--border-light)', fontSize: 10, color: 'var(--text-faint)' }}>
                      <span>Ordenado: {r.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</span>
                      <span>Entregado: {d?.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    {(item as any).delivered_by && (
                      <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 2 }}>
                        Entregó: {(item as any).delivered_by}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* ─── Dual Station Live View ─── */
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }} data-kds-dual>
          <StationPanel station="bar" title="Barra" color="#B45309"
            items={activeBar} now={now} userRole={userRole} operatorType={operatorType}
            onMarkReady={handleMarkReady} onMarkDelivered={handleMarkDelivered} />
          <StationPanel station="kitchen" title="Cocina" color="#059669"
            items={activeKitchen} now={now} userRole={userRole} operatorType={operatorType}
            onMarkReady={handleMarkReady} onMarkDelivered={handleMarkDelivered} />
        </div>
      )}

      {undoAction && <UndoToast action={undoAction} onUndo={handleUndo} onDismiss={() => setUndoAction(null)} />}
    </div>
  );
}
