import React, { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import type { Order } from '../api';

function OrderDetail({ order, onClose }: { order: Order; onClose: () => void }) {
  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <div>
            <span style={styles.modalOrderNum}>Orden #{order.order_number}</span>
            <span style={styles.modalType}>
              {order.order_type === 'to_go' ? 'Para llevar' : 'En tienda'}
            </span>
          </div>
          <button onClick={onClose} style={styles.closeBtn}>✕</button>
        </div>

        {order.customer_name && (
          <p style={styles.modalCustomer}>{order.customer_name}</p>
        )}
        <p style={styles.modalTime}>
          {new Date(order.created_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
        </p>

        <div style={styles.modalItems}>
          {order.items.map((item) => (
            <div key={item.id} style={styles.modalItemRow}>
              <span style={styles.modalQty}>{item.quantity}x</span>
              <div style={{ flex: 1 }}>
                <span style={styles.modalItemName}>{item.product_name}</span>
                {item.modifiers.length > 0 && (
                  <div style={styles.modalMods}>
                    {item.modifiers.map((m) => (
                      <span key={m.id} style={styles.modalModTag}>{m.shortName || m.name}</span>
                    ))}
                  </div>
                )}
                {item.notes && <p style={styles.modalNotes}>{item.notes}</p>}
              </div>
              <span style={styles.modalItemTotal}>${item.line_total.toFixed(2)}</span>
            </div>
          ))}
        </div>

        <div style={styles.modalFooter}>
          <span style={{
            ...styles.payBadge,
            backgroundColor: order.payment_method === 'cash' ? '#D1FAE5' : '#DBEAFE',
            color: order.payment_method === 'cash' ? '#065F46' : '#1E40AF',
          }}>
            {order.payment_method === 'cash' ? 'Efectivo' : 'Tarjeta'}
          </span>
          <span style={styles.modalTotal}>${order.total.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}

export default function OrdersScreen() {
  const { orders, fetchOrders } = useStore();
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  useEffect(() => { fetchOrders(); }, []);

  return (
    <div style={styles.container}>
      <h2 style={styles.title}>Órdenes del día</h2>
      <p style={styles.subtitle}>{orders.length} orden{orders.length !== 1 ? 'es' : ''}</p>

      {orders.length === 0 ? (
        <p style={styles.empty}>No hay órdenes aún. Crea una desde el POS.</p>
      ) : (
        <div style={styles.chipGrid}>
          {orders.map((o) => (
            <button key={o.id} onClick={() => setSelectedOrder(o)} style={styles.chip}>
              <div style={styles.chipTop}>
                <span style={styles.chipNum}>#{o.order_number}</span>
                <span style={styles.chipTime}>
                  {new Date(o.created_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              {o.customer_name && <p style={styles.chipCustomer}>{o.customer_name}</p>}
              <div style={styles.chipBottom}>
                <span style={styles.chipItems}>{o.items.length} item{o.items.length !== 1 ? 's' : ''}</span>
                <span style={{
                  ...styles.chipTypeBadge,
                  backgroundColor: o.order_type === 'to_go' ? '#FEF3C7' : '#DBEAFE',
                  color: o.order_type === 'to_go' ? '#92400E' : '#1E40AF',
                }}>
                  {o.order_type === 'to_go' ? 'Llevar' : 'Mesa'}
                </span>
              </div>
              <span style={styles.chipTotal}>${o.total.toFixed(2)}</span>
            </button>
          ))}
        </div>
      )}

      {selectedOrder && (
        <OrderDetail order={selectedOrder} onClose={() => setSelectedOrder(null)} />
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { padding: 24, overflowY: 'auto', height: '100%' },
  title: { fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: 0 },
  subtitle: { fontSize: 13, color: 'var(--text-faint)', margin: '4px 0 20px' },
  empty: { color: 'var(--text-faint)', textAlign: 'center', marginTop: 80, fontSize: 14 },

  chipGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 },
  chip: {
    backgroundColor: 'var(--bg-card)', borderRadius: 12, border: '1px solid var(--border)', padding: 14,
    cursor: 'pointer', textAlign: 'left' as const, transition: 'all 0.2s ease',
    display: 'flex', flexDirection: 'column', gap: 6,
  },
  chipTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  chipNum: { fontWeight: 800, fontSize: 16, color: 'var(--text-primary)' },
  chipTime: { fontSize: 11, color: 'var(--text-faint)' },
  chipCustomer: { fontSize: 12, color: 'var(--text-muted)', margin: 0, fontWeight: 500 },
  chipBottom: { display: 'flex', gap: 6, alignItems: 'center' },
  chipItems: { fontSize: 11, color: 'var(--text-faint)' },
  chipTypeBadge: { fontSize: 10, padding: '1px 6px', borderRadius: 4, fontWeight: 600 },
  chipTotal: { fontWeight: 700, fontSize: 16, color: 'var(--text-primary)', marginTop: 2 },

  overlay: { position: 'fixed', inset: 0, backgroundColor: 'var(--overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modal: { backgroundColor: 'var(--bg-card)', borderRadius: 20, padding: 24, width: 420, maxHeight: '80vh', overflowY: 'auto' as const, border: '1px solid var(--border)' },
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  modalOrderNum: { fontSize: 22, fontWeight: 800, color: 'var(--text-primary)' },
  modalType: { fontSize: 12, backgroundColor: 'var(--bg-hover)', padding: '2px 8px', borderRadius: 4, color: 'var(--text-muted)', fontWeight: 500, marginLeft: 8 },
  closeBtn: { width: 32, height: 32, borderRadius: 8, border: 'none', backgroundColor: 'var(--bg-hover)', cursor: 'pointer', fontSize: 16, color: 'var(--text-muted)' },
  modalCustomer: { fontSize: 14, color: 'var(--text-secondary)', fontWeight: 600, margin: '4px 0 0' },
  modalTime: { fontSize: 12, color: 'var(--text-faint)', margin: '2px 0 16px' },

  modalItems: { display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 },
  modalItemRow: { display: 'flex', gap: 8, alignItems: 'flex-start', padding: '8px 0', borderBottom: '1px solid var(--border-light)' },
  modalQty: { fontWeight: 700, fontSize: 14, color: 'var(--text-secondary)', minWidth: 28 },
  modalItemName: { fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' },
  modalMods: { display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  modalModTag: { fontSize: 11, backgroundColor: 'var(--bg-hover)', padding: '2px 6px', borderRadius: 4, color: 'var(--text-muted)' },
  modalNotes: { fontSize: 12, color: 'var(--warning)', fontStyle: 'italic', margin: '4px 0 0' },
  modalItemTotal: { fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginLeft: 'auto' },

  modalFooter: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12, borderTop: '1px solid var(--border)' },
  payBadge: { fontSize: 13, padding: '4px 12px', borderRadius: 8, fontWeight: 600 },
  modalTotal: { fontSize: 24, fontWeight: 800, color: 'var(--text-primary)' },
};
