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
  station?: string; // if from KDS, filter by relevance
}

export default function WasteModal({ open, onClose, station }: Props) {
  const [itemType, setItemType] = useState<'supply' | 'product'>('supply');
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedItem, setSelectedItem] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [reason, setReason] = useState('accident');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (open) {
      api.fetchInventory().then(setInventory);
      api.fetchMenu().then(m => setProducts(m.products));
      setSelectedItem('');
      setQuantity('1');
      setReason('accident');
      setNotes('');
      setSuccess(false);
    }
  }, [open]);

  if (!open) return null;

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
            <h3 style={{ margin: 0, color: '#065F46' }}>Merma registrada</h3>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <div style={styles.header}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Registrar Merma</h3>
          <button onClick={onClose} style={styles.closeBtn}>&#10005;</button>
        </div>

        <div style={styles.body}>
          {/* Type toggle */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            <button onClick={() => { setItemType('supply'); setSelectedItem(''); }}
              style={{ ...styles.typeBtn, backgroundColor: itemType === 'supply' ? '#1F2937' : '#F3F4F6', color: itemType === 'supply' ? '#FFF' : '#374151' }}>
              Insumo
            </button>
            <button onClick={() => { setItemType('product'); setSelectedItem(''); }}
              style={{ ...styles.typeBtn, backgroundColor: itemType === 'product' ? '#1F2937' : '#F3F4F6', color: itemType === 'product' ? '#FFF' : '#374151' }}>
              Producto
            </button>
          </div>

          {/* Item selection */}
          <select value={selectedItem} onChange={e => setSelectedItem(e.target.value)} style={styles.select}>
            <option value="">-- Seleccionar {itemType === 'supply' ? 'insumo' : 'producto'} --</option>
            {itemType === 'supply'
              ? inventory.map(i => <option key={i.id} value={i.id}>{i.name} ({i.stock} {i.unit})</option>)
              : products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)
            }
          </select>

          {/* Quantity */}
          <input type="number" min="0.1" step="0.1" value={quantity} onChange={e => setQuantity(e.target.value)}
            placeholder="Cantidad" style={styles.input} />

          {/* Reason */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '8px 0' }}>
            {REASONS.map(r => (
              <button key={r.id} onClick={() => setReason(r.id)}
                style={{ ...styles.reasonBtn, backgroundColor: reason === r.id ? '#1F2937' : '#F3F4F6', color: reason === r.id ? '#FFF' : '#374151' }}>
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
  overlay: { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 },
  modal: { width: '95%', maxWidth: 440, backgroundColor: '#FFF', borderRadius: 18, overflow: 'hidden', boxShadow: '0 25px 50px rgba(0,0,0,0.3)' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid #E5E7EB' },
  closeBtn: { width: 32, height: 32, borderRadius: 16, border: '1px solid #E5E7EB', backgroundColor: '#F9FAFB', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6B7280' },
  body: { padding: '16px 20px' },
  typeBtn: { flex: 1, padding: '8px 0', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13, textAlign: 'center' as const },
  select: { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #D1D5DB', fontSize: 13, marginBottom: 10, outline: 'none', backgroundColor: '#FFF' },
  input: { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #D1D5DB', fontSize: 13, marginBottom: 10, outline: 'none', boxSizing: 'border-box' as const },
  reasonBtn: { padding: '6px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 12 },
  submitBtn: { width: '100%', padding: '14px 0', border: 'none', backgroundColor: '#DC2626', color: '#FFF', fontSize: 15, fontWeight: 700, cursor: 'pointer' },
};
