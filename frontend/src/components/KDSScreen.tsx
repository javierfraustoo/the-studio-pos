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
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 18px', backgroundColor: 'var(--bg-hover)', borderRadius: 14, boxShadow: '0 12px 40px rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.08)' }}>
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
      borderRadius: 16, border: `2px solid ${isReady ? 'rgba(59,130,246,0.3)' : sla.border}`,
      backgroundColor: isReady ? 'rgba(59,130,246,0.06)' : sla.bg,
      padding: 14, display: 'flex', flexDirection: 'column' as const, gap: 6,
      transition: 'all 0.3s ease',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)' }}>#{item.order_number}</span>
          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)' }}>
            {item.order_type === 'to_go' ? 'LLEVAR' : 'MESA'}
          </span>
        </div>
        <span style={{ fontSize: 24, fontWeight: 800, fontFamily: 'monospace', fontVariantNumeric: 'tabular-nums' as const, color: isReady ? '#3B82F6' : sla.text }}>
          {isReady ? 'LISTO' : formatElapsed(elapsed)}
        </span>
      </div>

      {item.customer_name && <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', margin: 0 }}>{item.customer_name}</p>}
      {!isReady && sla.label && <div style={{ alignSelf: 'flex-start', fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 6, backgroundColor: sla.text, color: '#FFF', letterSpacing: '0.05em' }}>{sla.label}</div>}

      <div style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
        <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)' }}>{item.quantity}x</span>
        <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-secondary)' }}>{item.product_name}</span>
      </div>

      {item.modifiers.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 4 }}>
          {item.modifiers.map((m, i) => <span key={i} style={{ fontSize: 11, backgroundColor: 'rgba(255,255,255,0.06)', padding: '2px 7px', borderRadius: 6, fontWeight: 600, color: 'var(--text-muted)' }}>{m}</span>)}
        </div>
      )}

      {item.notes && <p style={{ fontSize: 12, color: '#F59E0B', fontStyle: 'italic', fontWeight: 600, margin: 0, padding: '3px 8px', backgroundColor: 'rgba(245,158,11,0.08)', borderRadius: 6 }}>{item.notes}</p>}

      {item.status !== 'ready' && !(userRole === 'operador' && operatorType === 'cajero') && (
        <button onClick={() => onMarkReady(item.id)}
          style={{ width: '100%', padding: '10px 0', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #059669, #10B981)', color: '#FFF', fontSize: 14, fontWeight: 800, cursor: 'pointer', letterSpacing: '0.03em', marginTop: 4 }}>
          LISTO
        </button>
      )}
      {item.status === 'ready' && (
        <button onClick={() => onMarkDelivered(item.id)}
          style={{ width: '100%', padding: '10px 0', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #2563EB, #3B82F6)', color: '#FFF', fontSize: 14, fontWeight: 800, cursor: 'pointer', letterSpacing: '0.03em', marginTop: 4 }}>
          ENTREGADO
        </button>
      )}
    </div>
  );
}

export default function KDSScreen() {
  const { kdsItems, fetchKdsItems, currentUser } = useStore();
  const userRole = currentUser?.role || 'operador';
  const operatorType = (currentUser as any)?.operator_type || 'cajero';
  const now = useTimer();
  const [activeStation, setActiveStation] = useState<'bar' | 'kitchen'>('bar');
  const [showHistory, setShowHistory] = useState(false);
  const [historyItems, setHistoryItems] = useState<KdsItem[]>([]);
  const [undoAction, setUndoAction] = useState<UndoAction | null>(null);
  const stationRef = useRef(activeStation);
  stationRef.current = activeStation;

  useEffect(() => { fetchKdsItems(activeStation); }, [activeStation]);

  const loadHistory = useCallback(async () => { setHistoryItems(await api.fetchKdsHistory(activeStation)); }, [activeStation]);

  const stationItems = kdsItems.filter((i) => i.station === activeStation && i.status !== 'delivered')
    .sort((a, b) => new Date(a.routed_at).getTime() - new Date(b.routed_at).getTime());

  const handleMarkReady = useCallback(async (id: string) => {
    const item = kdsItems.find(k => k.id === id);
    if (!item) return;
    useStore.getState().updateKdsItemLocal({ ...item, status: 'ready', ready_at: new Date().toISOString() });
    setUndoAction({ itemId: id, previousStatus: item.status, itemName: item.product_name });
    try { await api.updateKdsItem(id, 'ready'); } catch { useStore.getState().updateKdsItemLocal(item); setUndoAction(null); }
  }, [kdsItems]);

  const handleMarkDelivered = useCallback(async (id: string) => {
    const item = kdsItems.find(k => k.id === id);
    if (!item) return;
    useStore.getState().updateKdsItemLocal({ ...item, status: 'delivered' });
    setUndoAction({ itemId: id, previousStatus: item.status, itemName: item.product_name });
    try { await api.updateKdsItem(id, 'delivered'); } catch { useStore.getState().updateKdsItemLocal(item); setUndoAction(null); }
  }, [kdsItems]);

  const handleUndo = useCallback(async () => {
    if (!undoAction) return;
    setUndoAction(null);
    try { await api.updateKdsItem(undoAction.itemId, undoAction.previousStatus); } catch (e) { console.error('Undo failed:', e); }
  }, [undoAction]);

  const pendingCount = stationItems.filter((i) => i.status !== 'ready').length;
  const readyCount = stationItems.filter((i) => i.status === 'ready').length;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: 20, overflowY: 'auto', backgroundColor: 'var(--bg-primary)' }}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, alignItems: 'center', flexWrap: 'wrap' as const }}>
        {(['bar', 'kitchen'] as const).map((st) => {
          const isActive = activeStation === st;
          const color = st === 'bar' ? '#B45309' : '#059669';
          return (
            <button key={st} onClick={() => { setActiveStation(st); setShowHistory(false); }}
              style={{
                padding: '8px 18px', borderRadius: 12, border: `1px solid ${isActive ? color : 'rgba(255,255,255,0.06)'}`,
                cursor: 'pointer', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8,
                backgroundColor: isActive ? `${color}18` : 'transparent', color: isActive ? color : '#71717A',
              }}>
              KDS {st === 'bar' ? 'Barra' : 'Cocina'}
              {isActive && pendingCount > 0 && <span style={{ backgroundColor: '#EF4444', color: '#FFF', fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 10 }}>{pendingCount}</span>}
            </button>
          );
        })}
        <button onClick={() => { setShowHistory(!showHistory); if (!showHistory) loadHistory(); }}
          style={{ padding: '8px 18px', borderRadius: 12, border: `1px solid ${showHistory ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.06)'}`, cursor: 'pointer', fontWeight: 600, fontSize: 13, backgroundColor: showHistory ? 'rgba(255,255,255,0.06)' : 'transparent', color: showHistory ? '#D4D4D8' : '#52525B' }}>
          {showHistory ? 'Pendientes' : 'Historial'}
        </button>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 14 }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#F59E0B' }} /> {pendingCount} pend.</span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#3B82F6' }} /> {readyCount} listos</span>
        </div>
      </div>

      {showHistory ? (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <h4 style={{ margin: '0 0 12px', color: 'var(--text-faint)', fontSize: 12, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.08em' }}>Entregados Hoy ({historyItems.length})</h4>
          {historyItems.length === 0 ? <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-faint)' }}>Sin entregas hoy</div> : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
              {historyItems.map(item => {
                const d = item.delivered_at ? new Date(item.delivered_at) : null;
                const r = new Date(item.routed_at);
                const pm = d ? Math.floor((d.getTime() - r.getTime()) / 60000) : 0;
                return (
                  <div key={item.id} style={{ borderRadius: 12, border: '1px solid rgba(255,255,255,0.04)', backgroundColor: 'rgba(255,255,255,0.02)', padding: 12, opacity: 0.7 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-muted)' }}>#{item.order_number}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-faint)', fontWeight: 600 }}>{pm} min</span>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginTop: 4 }}>{item.quantity}x {item.product_name}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 4 }}>{d?.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : stationItems.length === 0 ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 40, marginBottom: 12, opacity: 0.3 }}>{activeStation === 'bar' ? '☕' : '🍳'}</span>
          <p style={{ color: 'var(--text-faint)', fontSize: 14 }}>Sin órdenes pendientes en {activeStation === 'bar' ? 'barra' : 'cocina'}</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10, flex: 1, alignContent: 'start' }}>
          {stationItems.map((item) => (
            <KdsItemCard key={item.id} item={item} now={now} userRole={userRole} operatorType={operatorType}
              onMarkReady={handleMarkReady} onMarkDelivered={handleMarkDelivered} />
          ))}
        </div>
      )}

      {undoAction && <UndoToast action={undoAction} onUndo={handleUndo} onDismiss={() => setUndoAction(null)} />}
    </div>
  );
}
