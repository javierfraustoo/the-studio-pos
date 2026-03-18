import React, { useEffect } from 'react';
import { useStore } from '../store/useStore';

export default function InventoryScreen() {
  const { inventory, fetchInventory } = useStore();

  useEffect(() => { fetchInventory(); }, []);

  const lowStockCount = inventory.filter((i) => i.stock <= i.minimumStock).length;

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <h2 style={styles.title}>Inventario</h2>
          <p style={styles.subtitle}>
            {inventory.length} materias primas
            {lowStockCount > 0 && (
              <span style={styles.lowAlert}> — {lowStockCount} con stock bajo</span>
            )}
          </p>
        </div>
      </div>

      <div style={styles.table}>
        <div style={styles.tableHeader}>
          <span style={{ ...styles.th, flex: 2 }}>Material</span>
          <span style={styles.th}>Stock Actual</span>
          <span style={styles.th}>Minimo</span>
          <span style={styles.th}>Lotes FIFO</span>
          <span style={styles.th}>Proxima Caducidad</span>
          <span style={{ ...styles.th, flex: 0.5 }}>Estado</span>
        </div>

        {inventory.map((item) => {
          const isLow = item.stock <= item.minimumStock;
          const activeBatches = item.batches.filter((b) => b.quantity_remaining > 0);
          const nearestExpiry = activeBatches.find((b) => b.expires_at !== null);
          const expiryDays = nearestExpiry?.expires_at
            ? Math.ceil((new Date(nearestExpiry.expires_at).getTime() - Date.now()) / 86400000)
            : null;

          return (
            <details key={item.id} style={styles.row}>
              <summary style={{ ...styles.rowSummary, backgroundColor: isLow ? 'var(--danger-bg)' : 'var(--bg-card)' }}>
                <span style={{ ...styles.td, flex: 2, fontWeight: 600 }}>{item.name}</span>
                <span style={{ ...styles.td, fontWeight: 700, color: isLow ? '#EF4444' : '#FAFAFA' }}>
                  {item.stock.toFixed(item.unit === 'pz' ? 0 : 1)} {item.unit}
                </span>
                <span style={styles.td}>{item.minimumStock} {item.unit}</span>
                <span style={styles.td}>{activeBatches.length}</span>
                <span style={{ ...styles.td, color: expiryDays !== null && expiryDays <= 3 ? '#EF4444' : '#A1A1AA' }}>
                  {expiryDays !== null ? `${expiryDays} dias` : '—'}
                </span>
                <span style={{ ...styles.td, flex: 0.5 }}>
                  <span style={{
                    ...styles.statusBadge,
                    backgroundColor: isLow ? 'rgba(239,68,68,0.12)' : 'rgba(16,185,129,0.12)',
                    color: isLow ? '#EF4444' : '#10B981',
                  }}>
                    {isLow ? 'BAJO' : 'OK'}
                  </span>
                </span>
              </summary>

              <div style={styles.batchDetail}>
                <div style={styles.batchHeader}>
                  <span style={styles.batchTh}>Lote</span>
                  <span style={styles.batchTh}>Recibido</span>
                  <span style={styles.batchTh}>Caduca</span>
                  <span style={styles.batchTh}>Restante</span>
                  <span style={styles.batchTh}>Costo/u</span>
                </div>
                {activeBatches.map((b, i) => (
                  <div key={b.id} style={{ ...styles.batchRow, backgroundColor: i === 0 ? 'rgba(245,158,11,0.08)' : '#18181B' }}>
                    <span style={styles.batchTd}>
                      {i === 0 && <span style={styles.fifoTag}>FIFO &#8594;</span>}
                      #{i + 1}
                    </span>
                    <span style={styles.batchTd}>
                      {new Date(b.received_at).toLocaleDateString('es-MX')}
                    </span>
                    <span style={styles.batchTd}>
                      {b.expires_at ? new Date(b.expires_at).toLocaleDateString('es-MX') : '—'}
                    </span>
                    <span style={{ ...styles.batchTd, fontWeight: 600 }}>
                      {b.quantity_remaining.toFixed(item.unit === 'pz' ? 0 : 1)} {item.unit}
                    </span>
                    <span style={styles.batchTd}>
                      ${b.cost_per_unit.toFixed(3)}
                    </span>
                  </div>
                ))}
              </div>
            </details>
          );
        })}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { padding: 24, overflowY: 'auto', height: '100%' },
  header: { marginBottom: 20 },
  title: { fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: 0 },
  subtitle: { fontSize: 13, color: 'var(--text-faint)', margin: '4px 0 0' },
  lowAlert: { color: '#EF4444', fontWeight: 600 },
  table: { display: 'flex', flexDirection: 'column', gap: 1 },
  tableHeader: { display: 'flex', padding: '10px 16px', backgroundColor: 'var(--bg-hover)', borderRadius: '8px 8px 0 0' },
  th: { flex: 1, fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' as const, letterSpacing: 0.5 },
  row: { borderBottom: '1px solid var(--border-light)' },
  rowSummary: { display: 'flex', padding: '12px 16px', cursor: 'pointer', alignItems: 'center', transition: 'background 0.2s' },
  td: { flex: 1, fontSize: 13, color: 'var(--text-secondary)' },
  statusBadge: { padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700 },
  batchDetail: { padding: '0 16px 12px', marginLeft: 16, borderLeft: '3px solid #F59E0B' },
  batchHeader: { display: 'flex', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' },
  batchTh: { flex: 1, fontSize: 10, fontWeight: 700, color: '#A1A1AA', textTransform: 'uppercase' as const },
  batchRow: { display: 'flex', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' },
  batchTd: { flex: 1, fontSize: 12, color: '#D4D4D8' },
  fifoTag: { fontSize: 10, fontWeight: 700, color: '#F59E0B', backgroundColor: 'rgba(245,158,11,0.12)', padding: '1px 5px', borderRadius: 3, marginRight: 4 },
};
