import React, { useEffect, useState } from 'react';
import { useStore } from '../store/useStore';
import type { InventoryItem } from '../api';

// Categorize inventory items
function categorizeItem(item: InventoryItem): string {
  const n = item.name.toLowerCase();
  if (n.includes('leche') || n.includes('croissant') || n.includes('cookie') || n.includes('pan') ||
      n.includes('jamon') || n.includes('queso') || n.includes('cafe en grano') || n.includes('bolsa cafe'))
    return 'Perecederos';
  if (n.includes('jarabe') || n.includes('hielo') || n.includes('filtro'))
    return 'Consumibles';
  if (n.includes('vaso') || n.includes('tapa') || n.includes('cup') || n.includes('lid'))
    return 'Desechables';
  return 'Otros';
}

const CATEGORY_ORDER = ['Perecederos', 'Consumibles', 'Desechables', 'Otros'];

export default function InventoryScreen() {
  const { inventory, fetchInventory } = useStore();
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => { fetchInventory(); }, []);

  const lowStockCount = inventory.filter((i) => i.stock <= i.minimumStock).length;

  // Group by category
  const grouped: Record<string, InventoryItem[]> = {};
  for (const item of inventory) {
    const cat = categorizeItem(item);
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(item);
  }

  const categories = CATEGORY_ORDER.filter(c => grouped[c]?.length);
  const displayItems = filter === 'all' ? inventory : (grouped[filter] || []);

  return (
    <div style={S.container}>
      <div style={S.header}>
        <div>
          <h2 style={S.title}>Inventario</h2>
          <p style={S.subtitle}>
            {inventory.length} materias primas
            {lowStockCount > 0 && <span style={S.lowAlert}> — {lowStockCount} con stock bajo</span>}
          </p>
        </div>
      </div>

      {/* Category filter tabs */}
      <div style={S.filterRow}>
        <button onClick={() => setFilter('all')}
          style={{ ...S.filterBtn, backgroundColor: filter === 'all' ? 'var(--accent-glow)' : 'var(--bg-hover)', color: filter === 'all' ? 'var(--accent)' : 'var(--text-muted)', border: `1px solid ${filter === 'all' ? 'rgba(16,185,129,0.2)' : 'var(--border)'}` }}>
          Todos ({inventory.length})
        </button>
        {categories.map(cat => (
          <button key={cat} onClick={() => setFilter(cat)}
            style={{ ...S.filterBtn, backgroundColor: filter === cat ? 'var(--accent-glow)' : 'var(--bg-hover)', color: filter === cat ? 'var(--accent)' : 'var(--text-muted)', border: `1px solid ${filter === cat ? 'rgba(16,185,129,0.2)' : 'var(--border)'}` }}>
            {cat} ({grouped[cat]?.length || 0})
          </button>
        ))}
        {lowStockCount > 0 && (
          <button onClick={() => setFilter('low')}
            style={{ ...S.filterBtn, backgroundColor: filter === 'low' ? 'var(--danger-bg)' : 'var(--bg-hover)', color: filter === 'low' ? 'var(--danger)' : 'var(--text-muted)', border: `1px solid ${filter === 'low' ? 'rgba(239,68,68,0.2)' : 'var(--border)'}` }}>
            ⚠ Stock bajo ({lowStockCount})
          </button>
        )}
      </div>

      {/* Inventory grid */}
      <div style={S.grid}>
        {(filter === 'low' ? inventory.filter(i => i.stock <= i.minimumStock) : displayItems).map(item => {
          const isLow = item.stock <= item.minimumStock;
          const activeBatches = item.batches.filter(b => b.quantity_remaining > 0);
          const nearestExpiry = activeBatches.find(b => b.expires_at !== null);
          const expiryDays = nearestExpiry?.expires_at
            ? Math.ceil((new Date(nearestExpiry.expires_at).getTime() - Date.now()) / 86400000)
            : null;

          return (
            <details key={item.id} style={S.card}>
              <summary style={S.cardSummary}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)', marginBottom: 4 }}>{item.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                    {categorizeItem(item)} · {activeBatches.length} lote{activeBatches.length !== 1 ? 's' : ''}
                    {expiryDays !== null && <span style={{ color: expiryDays <= 3 ? '#EF4444' : 'var(--text-faint)' }}> · Caduca en {expiryDays}d</span>}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 700, fontSize: 16, color: isLow ? '#EF4444' : 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                    {item.stock.toFixed(item.unit === 'pz' ? 0 : 1)} {item.unit}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>Mín: {item.minimumStock} {item.unit}</div>
                </div>
                <span style={{
                  ...S.statusBadge,
                  backgroundColor: isLow ? 'rgba(239,68,68,0.12)' : 'rgba(16,185,129,0.12)',
                  color: isLow ? '#EF4444' : '#10B981',
                }}>
                  {isLow ? 'BAJO' : 'OK'}
                </span>
              </summary>
              <div style={S.batchDetail}>
                {activeBatches.map((b, i) => (
                  <div key={b.id} style={{ ...S.batchRow, backgroundColor: i === 0 ? 'rgba(245,158,11,0.06)' : 'transparent' }}>
                    <span style={{ flex: 1 }}>
                      {i === 0 && <span style={S.fifoTag}>FIFO →</span>}
                      Lote #{i + 1}
                    </span>
                    <span style={{ flex: 1 }}>{new Date(b.received_at).toLocaleDateString('es-MX')}</span>
                    <span style={{ flex: 1 }}>{b.expires_at ? new Date(b.expires_at).toLocaleDateString('es-MX') : '—'}</span>
                    <span style={{ flex: 1, fontWeight: 600 }}>{b.quantity_remaining.toFixed(item.unit === 'pz' ? 0 : 1)} {item.unit}</span>
                    <span style={{ flex: 1 }}>${b.cost_per_unit.toFixed(3)}/u</span>
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

const S: Record<string, React.CSSProperties> = {
  container: { padding: 20, height: '100%', overflowY: 'auto', width: '100%' },
  header: { marginBottom: 16 },
  title: { fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.02em' },
  subtitle: { fontSize: 13, color: 'var(--text-faint)', margin: '4px 0 0' },
  lowAlert: { color: '#EF4444', fontWeight: 600 },

  filterRow: { display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' },
  filterBtn: { padding: '7px 14px', borderRadius: 10, cursor: 'pointer', fontWeight: 600, fontSize: 12, transition: 'all 0.2s' },

  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: 10, alignItems: 'start' },
  card: { borderRadius: 14, border: '1px solid var(--border)', backgroundColor: 'var(--bg-card)', overflow: 'hidden', transition: 'all 0.2s' },
  cardSummary: { display: 'flex', padding: '14px 16px', cursor: 'pointer', alignItems: 'center', gap: 12, transition: 'background 0.2s' },
  statusBadge: { padding: '3px 10px', borderRadius: 6, fontSize: 10, fontWeight: 700, flexShrink: 0 },

  batchDetail: { padding: '0 16px 12px', borderTop: '1px solid var(--border-light)' },
  batchRow: { display: 'flex', padding: '6px 0', borderBottom: '1px solid var(--border-light)', fontSize: 11, color: 'var(--text-secondary)', gap: 4 },
  fifoTag: { fontSize: 9, fontWeight: 700, color: '#F59E0B', backgroundColor: 'rgba(245,158,11,0.12)', padding: '1px 5px', borderRadius: 3, marginRight: 4 },
};
