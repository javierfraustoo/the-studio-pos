import React, { useState } from 'react';

interface Props {
  open: boolean;
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

export default function ConfirmModal({
  open, title = 'Confirmar', message,
  confirmLabel = 'Sí', cancelLabel = 'No',
  danger = true, onConfirm, onCancel,
}: Props) {
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  const handleConfirm = async () => {
    if (submitting) return;
    setSubmitting(true);
    try { await onConfirm(); } finally { setSubmitting(false); }
  };

  return (
    <div style={styles.overlay} onClick={onCancel}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.iconWrap}>
          <span style={{
            ...styles.icon,
            backgroundColor: danger ? 'rgba(239,68,68,0.12)' : 'rgba(59,130,246,0.12)',
            color: danger ? '#EF4444' : '#3B82F6',
          }}>
            {danger ? '!' : '?'}
          </span>
        </div>
        <h3 style={styles.title}>{title}</h3>
        <p style={styles.message}>{message}</p>
        <div style={styles.actions}>
          <button onClick={onCancel} disabled={submitting} style={styles.cancelBtn}>{cancelLabel}</button>
          <button onClick={handleConfirm} disabled={submitting}
            style={{
              ...styles.confirmBtn,
              background: danger ? 'linear-gradient(135deg, #DC2626, #EF4444)' : 'linear-gradient(135deg, #2563EB, #3B82F6)',
              opacity: submitting ? 0.6 : 1,
            }}>
            {submitting ? 'Procesando...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, backdropFilter: 'blur(8px)' },
  modal: { backgroundColor: 'var(--bg-card)', borderRadius: 24, padding: '32px 28px 24px', width: 380, textAlign: 'center', boxShadow: '0 25px 60px rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.08)', animation: 'fadeIn 0.2s ease-out' },
  iconWrap: { marginBottom: 16 },
  icon: { width: 52, height: 52, borderRadius: 16, fontSize: 24, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 8px', letterSpacing: '-0.02em' },
  message: { fontSize: 14, color: 'var(--text-muted)', margin: '0 0 24px', lineHeight: 1.5 },
  actions: { display: 'flex', gap: 12 },
  cancelBtn: { flex: 1, padding: '12px 0', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)', backgroundColor: 'rgba(255,255,255,0.04)', cursor: 'pointer', fontSize: 14, fontWeight: 600, color: 'var(--text-muted)', transition: 'all 0.2s' },
  confirmBtn: { flex: 1, padding: '12px 0', borderRadius: 12, border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 700, color: '#FFF', transition: 'all 0.2s' },
};
