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
      <h2 style={styles.title}>Ordenes del dia</h2>
      <p style={styles.subtitle}>{orders.length} orden{orders.length !== 1 ? 'es' : ''}</p>

      {orders.length === 0 ? (
        <p style={styles.empty}>No hay ordenes aun. Crea una desde el POS.</p>
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
  title: { fontSize: 22, fontWeight: 700, color: '#111827', margin: 0 },
  subtitle: { fontSize: 13, color: '#9CA3AF', margin: '4px 0 20px' },
  empty: { color: '#9CA3AF', textAlign: 'center', marginTop: 80, fontSize: 14 },

  chipGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 },
  chip: {
    backgroundColor: '#FFF', borderRadius: 12, border: '1px solid #E5E7EB', padding: 14,
    cursor: 'pointer', textAlign: 'left' as const, transition: 'all 0.15s',
    display: 'flex', flexDirection: 'column', gap: 6,
  },
  chipTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  chipNum: { fontWeight: 800, fontSize: 16, color: '#111827' },
  chipTime: { fontSize: 11, color: '#9CA3AF' },
  chipCustomer: { fontSize: 12, color: '#6B7280', margin: 0, fontWeight: 500 },
  chipBottom: { display: 'flex', gap: 6, alignItems: 'center' },
  chipItems: { fontSize: 11, color: '#9CA3AF' },
  chipTypeBadge: { fontSize: 10, padding: '1px 6px', borderRadius: 4, fontWeight: 600 },
  chipTotal: { fontWeight: 700, fontSize: 16, color: '#111827', marginTop: 2 },

  overlay: { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modal: { backgroundColor: '#FFF', borderRadius: 20, padding: 24, width: 420, maxHeight: '80vh', overflowY: 'auto' as const },
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  modalOrderNum: { fontSize: 22, fontWeight: 800, color: '#111827' },
  modalType: { fontSize: 12, backgroundColor: '#F3F4F6', padding: '2px 8px', borderRadius: 4, color: '#6B7280', fontWeight: 500, marginLeft: 8 },
  closeBtn: { width: 32, height: 32, borderRadius: 8, border: 'none', backgroundColor: '#F3F4F6', cursor: 'pointer', fontSize: 16, color: '#6B7280' },
  modalCustomer: { fontSize: 14, color: '#374151', fontWeight: 600, margin: '4px 0 0' },
  modalTime: { fontSize: 12, color: '#9CA3AF', margin: '2px 0 16px' },

  modalItems: { display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 },
  modalItemRow: { display: 'flex', gap: 8, alignItems: 'flex-start', padding: '8px 0', borderBottom: '1px solid #F3F4F6' },
  modalQty: { fontWeight: 700, fontSize: 14, color: '#374151', minWidth: 28 },
  modalItemName: { fontSize: 14, fontWeight: 600, color: '#1F2937' },
  modalMods: { display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  modalModTag: { fontSize: 11, backgroundColor: '#F3F4F6', padding: '2px 6px', borderRadius: 4, color: '#6B7280' },
  modalNotes: { fontSize: 12, color: '#D97706', fontStyle: 'italic', margin: '4px 0 0' },
  modalItemTotal: { fontSize: 14, fontWeight: 700, color: '#111827', marginLeft: 'auto' },

  modalFooter: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12, borderTop: '1px solid #E5E7EB' },
  payBadge: { fontSize: 13, padding: '4px 12px', borderRadius: 8, fontWeight: 600 },
  modalTotal: { fontSize: 24, fontWeight: 800, color: '#111827' },
};
