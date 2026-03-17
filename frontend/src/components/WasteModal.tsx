import React, { useState, useEffect } from 'react';
import * as api from '../api';
import type { InventoryItem, Product } from '../api';

const REASONS = [
  { id: 'accident', label: 'Accidente', icon: '💥' },
  { id: 'expired', label: 'Caducidad', icon: '📅' },
  { id: 'quality', label: 'Calidad', icon: '👎' },
  { id: 'overproduction', label: 'Sobreproduccion', icon: '📦' },
  { id: 'spill', label: 'Derrame', icon: '💧' },
  { id: 'other', label: 'Otro', icon: '❓' },
];

interface Props {
  open: boolean;
  onClose: () => void;
  station?: string; // 'bar' | 'kitchen' — filters items by area
}

export default function WasteModal({ open, onClose, station }: Props) {
  const [itemType, setItemType] = useState<'supply' | 'product'>('supply');
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<api.Category[]>([]);
  const [recipes, setRecipes] = useState<{ product_id: string; inventory_item_id: string }[]>([]);
  const [selectedItem, setSelectedItem] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [reason, setReason] = useState('accident');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (open) {
      api.fetchInventory().then(setInventory);
      api.fetchMenu().then(m => {
        setProducts(m.products);
        setCategories(m.categories);
        // Build a flat recipe map for filtering inventory by station
        const recipeMap: { product_id: string; inventory_item_id: string }[] = [];
        m.products.forEach((p: any) => {
          if (p.recipe) {
            p.recipe.forEach((r: any) => {
              recipeMap.push({ product_id: p.id, inventory_item_id: r.inventory_item_id });
            });
          }
        });
        setRecipes(recipeMap);
      });
      setSelectedItem('');
      setQuantity('1');
      setReason('accident');
      setNotes('');
      setSuccess(false);
    }
  }, [open]);

  if (!open) return null;

  // ─── RBAC: Filter by station (barista→bar, cocina→kitchen) ──────────
  const filteredProducts = (() => {
    if (!station) return products; // admin/supervisor: all
    const stationCatIds = categories
      .filter(c => c.kds_station === station)
      .map(c => c.id);
    return products.filter(p => stationCatIds.includes(p.category_id));
  })();

  const filteredInventory = (() => {
    if (!station) return inventory; // admin/supervisor: all
    // Only show inventory items used by products in this station
    const stationProductIds = new Set(filteredProducts.map(p => p.id));
    const stationInvIds = new Set(
      recipes.filter(r => stationProductIds.has(r.product_id)).map(r => r.inventory_item_id)
    );
    return inventory.filter(i => stationInvIds.has(i.id));
  })();

  const handleSubmit = async () => {
    if (!selectedItem || !quantity) return;
    setSaving(true);
    try {
      await api.createWaste({ itemType, itemId: selectedItem, quantity: parseFloat(quantity), reason, notes });
      setSuccess(true);
      setTimeout(() => { onClose(); }, 1200);
    } catch (e) {
      console.error(e);
    }
    setSaving(false);
  };

  if (success) {
    return (
      <div style={styles.overlay} onClick={onClose}>
        <div style={styles.modal} onClick={e => e.stopPropagation()}>
          <div style={{ textAlign: 'center', padding: 32 }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>&#10003;</div>
            <h3 style={{ margin: 0, color: 'var(--success)' }}>Merma registrada</h3>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <div style={styles.header}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>Registrar Merma</h3>
          <button onClick={onClose} style={styles.closeBtn}>&#10005;</button>
        </div>

        <div style={styles.body}>
          {/* Type toggle */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            <button onClick={() => { setItemType('supply'); setSelectedItem(''); }}
              style={{ ...styles.typeBtn, backgroundColor: itemType === 'supply' ? 'var(--accent)' : 'var(--bg-hover)', color: itemType === 'supply' ? 'var(--accent-text)' : 'var(--text-secondary)' }}>
              Insumo
            </button>
            <button onClick={() => { setItemType('product'); setSelectedItem(''); }}
              style={{ ...styles.typeBtn, backgroundColor: itemType === 'product' ? 'var(--accent)' : 'var(--bg-hover)', color: itemType === 'product' ? 'var(--accent-text)' : 'var(--text-secondary)' }}>
              Producto
            </button>
          </div>

          {/* Item selection */}
          <select value={selectedItem} onChange={e => setSelectedItem(e.target.value)} style={styles.select}>
            <option value="">-- Seleccionar {itemType === 'supply' ? 'insumo' : 'producto'} --</option>
            {itemType === 'supply'
              ? filteredInventory.map(i => <option key={i.id} value={i.id}>{i.name} ({i.stock} {i.unit})</option>)
              : filteredProducts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)
            }
          </select>

          {/* Quantity */}
          <input type="number" min="0.1" step="0.1" value={quantity} onChange={e => setQuantity(e.target.value)}
            placeholder="Cantidad" style={styles.input} />

          {/* Reason */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '8px 0' }}>
            {REASONS.map(r => (
              <button key={r.id} onClick={() => setReason(r.id)}
                style={{ ...styles.reasonBtn, backgroundColor: reason === r.id ? 'var(--accent)' : 'var(--bg-hover)', color: reason === r.id ? 'var(--accent-text)' : 'var(--text-secondary)' }}>
                {r.icon} {r.label}
              </button>
            ))}
          </div>

          {/* Notes */}
          <input placeholder="Notas (opcional)" value={notes} onChange={e => setNotes(e.target.value)} style={styles.input} />
        </div>

        <button onClick={handleSubmit} disabled={!selectedItem || saving}
          style={{ ...styles.submitBtn, opacity: !selectedItem || saving ? 0.5 : 1 }}>
          {saving ? 'Guardando...' : 'Registrar Merma'}
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: { position: 'fixed', inset: 0, backgroundColor: 'var(--overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 },
  modal: { width: '95%', maxWidth: 440, backgroundColor: 'var(--bg-card)', borderRadius: 18, overflow: 'hidden', boxShadow: '0 25px 50px rgba(0,0,0,0.3)', border: '1px solid var(--border)' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--border)' },
  closeBtn: { width: 32, height: 32, borderRadius: 16, border: '1px solid var(--border)', backgroundColor: 'var(--bg-hover)', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' },
  body: { padding: '16px 20px' },
  typeBtn: { flex: 1, padding: '8px 0', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13, textAlign: 'center' as const },
  select: { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, marginBottom: 10, outline: 'none', backgroundColor: 'var(--bg-input)', color: 'var(--text-primary)' },
  input: { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, marginBottom: 10, outline: 'none', boxSizing: 'border-box' as const, backgroundColor: 'var(--bg-input)', color: 'var(--text-primary)' },
  reasonBtn: { padding: '6px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 12 },
  submitBtn: { width: '100%', padding: '14px 0', border: 'none', backgroundColor: 'var(--danger)', color: '#FFF', fontSize: 15, fontWeight: 700, cursor: 'pointer' },
};
