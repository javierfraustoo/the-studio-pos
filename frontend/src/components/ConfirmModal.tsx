import React from 'react';

interface Props {
  open: boolean;
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({
  open, title = 'Confirmar', message,
  confirmLabel = 'Si', cancelLabel = 'No',
  danger = true, onConfirm, onCancel,
}: Props) {
  if (!open) return null;

  return (
    <div style={styles.overlay} onClick={onCancel}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.iconWrap}>
          <span style={{...styles.icon, backgroundColor: danger ? '#FEE2E2' : '#DBEAFE', color: danger ? '#DC2626' : '#2563EB'}}>
            {danger ? '!' : '?'}
          </span>
        </div>
        <h3 style={styles.title}>{title}</h3>
        <p style={styles.message}>{message}</p>
        <div style={styles.actions}>
          <button onClick={onCancel} style={styles.cancelBtn}>
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            style={{...styles.confirmBtn, backgroundColor: danger ? '#DC2626' : '#2563EB'}}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 },
  modal: { backgroundColor: '#FFF', borderRadius: 20, padding: '32px 28px 24px', width: 360, textAlign: 'center', boxShadow: '0 25px 50px rgba(0,0,0,0.25)' },
  iconWrap: { marginBottom: 16 },
  icon: { width: 48, height: 48, borderRadius: 24, fontSize: 24, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: 700, color: '#111827', margin: '0 0 8px' },
  message: { fontSize: 14, color: '#6B7280', margin: '0 0 24px', lineHeight: 1.5 },
  actions: { display: 'flex', gap: 12 },
  cancelBtn: { flex: 1, padding: '12px 0', borderRadius: 10, border: '1px solid #D1D5DB', backgroundColor: '#FFF', cursor: 'pointer', fontSize: 14, fontWeight: 600, color: '#374151' },
  confirmBtn: { flex: 1, padding: '12px 0', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 700, color: '#FFF' },
};
