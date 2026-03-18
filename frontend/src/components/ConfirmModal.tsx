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
    try {
      await onConfirm();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={styles.overlay} onClick={onCancel}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.iconWrap}>
          <span style={{...styles.icon, backgroundColor: danger ? 'var(--danger-bg)' : 'var(--info-bg)', color: danger ? 'var(--danger)' : 'var(--info)'}}>
            {danger ? '!' : '?'}
          </span>
        </div>
        <h3 style={styles.title}>{title}</h3>
        <p style={styles.message}>{message}</p>
        <div style={styles.actions}>
          <button onClick={onCancel} disabled={submitting} style={styles.cancelBtn}>
            {cancelLabel}
          </button>
          <button
            onClick={handleConfirm}
            disabled={submitting}
            style={{...styles.confirmBtn, backgroundColor: danger ? 'var(--danger)' : 'var(--info)', opacity: submitting ? 0.6 : 1}}
          >
            {submitting ? 'Procesando...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: { position: 'fixed', inset: 0, backgroundColor: 'var(--overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 },
  modal: { backgroundColor: 'var(--bg-card)', borderRadius: 20, padding: '32px 28px 24px', width: 360, textAlign: 'center', boxShadow: '0 25px 50px rgba(0,0,0,0.25)', border: '1px solid var(--border)' },
  iconWrap: { marginBottom: 16 },
  icon: { width: 48, height: 48, borderRadius: 24, fontSize: 24, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 8px' },
  message: { fontSize: 14, color: 'var(--text-muted)', margin: '0 0 24px', lineHeight: 1.5 },
  actions: { display: 'flex', gap: 12 },
  cancelBtn: { flex: 1, padding: '12px 0', borderRadius: 10, border: '1px solid var(--border)', backgroundColor: 'var(--bg-secondary)', cursor: 'pointer', fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', transition: 'all 0.2s' },
  confirmBtn: { flex: 1, padding: '12px 0', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 700, color: '#FFF', transition: 'all 0.2s' },
};
