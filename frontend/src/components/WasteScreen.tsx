import React, { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import ConfirmModal from './ConfirmModal';

type WasteReason = 'dropped' | 'expired' | 'wrong_order' | 'quality' | 'overproduction' | 'other';

const REASONS: { value: WasteReason; label: string; icon: string }[] = [
  { value: 'dropped', label: 'Se cayo / Accidente', icon: '\u{1F4A5}' },
  { value: 'expired', label: 'Caducado', icon: '\u{1F4C5}' },
  { value: 'wrong_order', label: 'Orden equivocada', icon: '\u274C' },
  { value: 'quality', label: 'Calidad', icon: '\u{1F50D}' },
  { value: 'overproduction', label: 'Sobreproduccion', icon: '\u{1F4E6}' },
  { value: 'other', label: 'Otro', icon: '\u{1F4DD}' },
];

export default function WasteScreen() {
  const { inventory, products, wasteLogs, fetchInventory, fetchWaste, registerWaste } = useStore();
  const [wasteType, setWasteType] = useState<'supply' | 'product'>('product');
  const [selectedId, setSelectedId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [reason, setReason] = useState<WasteReason>('dropped');
  const [notes, setNotes] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => { fetchInventory(); fetchWaste(); }, []);

  const handleSubmit = () => {
    if (!selectedId || !quantity) return;
    setShowConfirm(true);
  };

  const handleConfirm = async () => {
    await registerWaste({
      itemType: wasteType,
      itemId: selectedId,
      quantity: Number(quantity),
      reason,
      notes,
    });
    setSelectedId('');
    setQuantity('1');
    setNotes('');
    setShowConfirm(false);
  };

  const items = wasteType === 'supply'
    ? inventory.map((i) => ({ id: i.id, name: i.name, unit: i.unit }))
    : products.map((p) => ({ id: p.id, name: p.name, unit: 'pz' }));

  const selectedItem = items.find((i) => i.id === selectedId);

  return (
    <div style={styles.container}>
      <h2 style={styles.title}>Registro de Merma</h2>
      <p style={styles.subtitle}>Registra accidentes, caducidades y desperdicios</p>

      <div style={styles.formGrid}>
        <div style={styles.form}>
          <div style={styles.field}>
            <label style={styles.label}>Tipo de merma</label>
            <div style={styles.toggleRow}>
              <button onClick={() => { setWasteType('product'); setSelectedId(''); }}
                style={{ ...styles.toggleBtn, backgroundColor: wasteType === 'product' ? 'var(--accent)' : 'var(--bg-hover)', color: wasteType === 'product' ? 'var(--accent-text)' : 'var(--text-secondary)' }}>
                Producto terminado
              </button>
              <button onClick={() => { setWasteType('supply'); setSelectedId(''); }}
                style={{ ...styles.toggleBtn, backgroundColor: wasteType === 'supply' ? 'var(--accent)' : 'var(--bg-hover)', color: wasteType === 'supply' ? 'var(--accent-text)' : 'var(--text-secondary)' }}>
                Insumo / Materia prima
              </button>
            </div>
          </div>

          <div style={styles.field}>
            <label style={styles.label}>{wasteType === 'product' ? 'Producto' : 'Insumo'}</label>
            <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} style={styles.select}>
              <option value="">Seleccionar...</option>
              {items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Cantidad ({selectedItem?.unit || '—'})</label>
            <input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)}
              min="0.1" step="0.1" style={styles.input} />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Razon</label>
            <div style={styles.reasonGrid}>
              {REASONS.map((r) => (
                <button key={r.value} onClick={() => setReason(r.value)}
                  style={{ ...styles.reasonBtn, backgroundColor: reason === r.value ? 'var(--accent)' : 'var(--bg-card)', color: reason === r.value ? 'var(--accent-text)' : 'var(--text-secondary)', borderColor: reason === r.value ? 'var(--accent)' : 'var(--border)' }}>
                  <span>{r.icon}</span>
                  <span style={{ fontSize: 12 }}>{r.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Notas (opcional)</label>
            <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="Ej: Se resbalo de la barra" style={styles.input} />
          </div>

          <button onClick={handleSubmit} disabled={!selectedId}
            style={{ ...styles.submitBtn, opacity: selectedId ? 1 : 0.4 }}>
            Registrar Merma
          </button>
        </div>

        <div style={styles.logPanel}>
          <h3 style={styles.logTitle}>Mermas recientes</h3>
          {wasteLogs.length === 0 ? (
            <p style={styles.logEmpty}>Sin mermas registradas</p>
          ) : (
            wasteLogs.slice(0, 15).map((w) => (
              <div key={w.id} style={styles.logItem}>
                <div style={styles.logItemTop}>
                  <span style={styles.logItemName}>{w.item_name}</span>
                  <span style={styles.logItemQty}>-{w.quantity} {w.unit}</span>
                </div>
                <div style={styles.logItemBottom}>
                  <span style={styles.logReason}>
                    {REASONS.find((r) => r.value === w.reason)?.icon} {REASONS.find((r) => r.value === w.reason)?.label}
                  </span>
                  <span style={styles.logTime}>
                    {new Date(w.created_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                {w.notes && <p style={styles.logNotes}>{w.notes}</p>}
                <span style={styles.logCost}>-${w.total_cost.toFixed(2)}</span>
              </div>
            ))
          )}
        </div>
      </div>

      <ConfirmModal
        open={showConfirm}
        title="Registrar merma"
        message={`Se descontara ${quantity} ${selectedItem?.unit || ''} de "${selectedItem?.name || ''}" como merma por "${REASONS.find(r => r.value === reason)?.label}". Esta accion no se puede deshacer.`}
        confirmLabel="Si, registrar"
        cancelLabel="Cancelar"
        danger={true}
        onConfirm={handleConfirm}
        onCancel={() => setShowConfirm(false)}
      />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { padding: 24, height: '100%', overflowY: 'auto' },
  title: { fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: 0 },
  subtitle: { fontSize: 13, color: 'var(--text-faint)', margin: '4px 0 20px' },
  formGrid: { display: 'flex', gap: 24 },
  form: { flex: 1, display: 'flex', flexDirection: 'column', gap: 16 },
  field: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: { fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' as const, letterSpacing: 0.5 },
  toggleRow: { display: 'flex', gap: 8 },
  toggleBtn: { flex: 1, padding: '10px 0', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13 },
  select: { padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 14, outline: 'none', backgroundColor: 'var(--bg-input)', color: 'var(--text-primary)' },
  input: { padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 14, outline: 'none', backgroundColor: 'var(--bg-input)', color: 'var(--text-primary)', boxSizing: 'border-box' as const },
  reasonGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 },
  reasonBtn: { padding: '10px 8px', borderRadius: 10, border: '1.5px solid', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, fontWeight: 500, transition: 'all 0.15s' },
  submitBtn: { padding: '14px 0', borderRadius: 12, border: 'none', backgroundColor: 'var(--danger)', color: '#FFF', fontSize: 15, fontWeight: 700, cursor: 'pointer' },
  logPanel: { width: 320, backgroundColor: 'var(--bg-card)', borderRadius: 16, border: '1px solid var(--border)', padding: 16, overflowY: 'auto', maxHeight: 500 },
  logTitle: { fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 12px' },
  logEmpty: { color: 'var(--text-faint)', fontSize: 13, textAlign: 'center', marginTop: 40 },
  logItem: { padding: '10px 0', borderBottom: '1px solid var(--border-light)' },
  logItemTop: { display: 'flex', justifyContent: 'space-between' },
  logItemName: { fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' },
  logItemQty: { fontWeight: 700, fontSize: 13, color: 'var(--danger)', fontFamily: 'monospace' },
  logItemBottom: { display: 'flex', justifyContent: 'space-between', marginTop: 4 },
  logReason: { fontSize: 12, color: 'var(--text-muted)' },
  logTime: { fontSize: 11, color: 'var(--text-faint)' },
  logNotes: { fontSize: 12, color: 'var(--warning)', fontStyle: 'italic', margin: '4px 0 0' },
  logCost: { fontSize: 11, color: 'var(--danger)', fontWeight: 600 },
};
