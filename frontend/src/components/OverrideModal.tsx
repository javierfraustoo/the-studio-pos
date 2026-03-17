import React, { useState, useEffect, useCallback } from 'react';
import { verifyOverride } from '../api';

interface OverrideModalProps {
  isOpen: boolean;
  action: string;
  actionLabel: string;
  details?: any;
  requestedBy: string;
  onAuthorized: (overrideUser: { id: string; name: string; role: string }) => void;
  onCancel: () => void;
}

const PIN_LENGTH = 6;

export default function OverrideModal({
  isOpen, action, actionLabel, details, requestedBy, onAuthorized, onCancel,
}: OverrideModalProps) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [shaking, setShaking] = useState(false);
  const [loading, setLoading] = useState(false);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setPin('');
      setError('');
      setShaking(false);
      setLoading(false);
    }
  }, [isOpen]);

  const triggerShake = useCallback(() => {
    setShaking(true);
    setTimeout(() => setShaking(false), 500);
  }, []);

  const handleSubmit = useCallback(async (currentPin: string) => {
    if (currentPin.length !== PIN_LENGTH || loading) return;
    setLoading(true);
    setError('');
    try {
      const res = await verifyOverride(currentPin, action, details);
      if (res.authorized && res.overrideUser) {
        onAuthorized(res.overrideUser);
      } else {
        setPin('');
        setError('PIN Incorrecto');
        triggerShake();
      }
    } catch {
      setPin('');
      setError('PIN Incorrecto');
      triggerShake();
    } finally {
      setLoading(false);
    }
  }, [action, details, loading, onAuthorized, triggerShake]);

  const handleDigit = useCallback((digit: string) => {
    if (loading) return;
    setError('');
    setPin(prev => {
      if (prev.length >= PIN_LENGTH) return prev;
      const next = prev + digit;
      if (next.length === PIN_LENGTH) {
        setTimeout(() => handleSubmit(next), 150);
      }
      return next;
    });
  }, [loading, handleSubmit]);

  const handleClear = useCallback(() => {
    if (loading) return;
    setPin('');
    setError('');
  }, [loading]);

  // Keyboard support
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onCancel(); return; }
      if (e.key >= '0' && e.key <= '9') { handleDigit(e.key); return; }
      if (e.key === 'Backspace') { setPin(p => p.slice(0, -1)); setError(''); return; }
      if (e.key === 'Enter') { handleSubmit(pin); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onCancel, handleDigit, handleSubmit, pin]);

  if (!isOpen) return null;

  const dots = Array.from({ length: PIN_LENGTH }, (_, i) =>
    i < pin.length ? '\u25CF' : '\u25CB'
  );

  return (
    <>
      <style>{keyframesCSS}</style>
      <div style={styles.overlay} onClick={onCancel}>
        <div
          style={{
            ...styles.modal,
            animation: shaking ? 'overrideShake 0.5s ease-in-out' : 'overrideFadeIn 0.25s ease-out',
          }}
          onClick={e => e.stopPropagation()}
        >
          {/* Lock icon */}
          <div style={styles.lockIcon}>
            <span style={{ fontSize: 36 }} role="img" aria-label="lock">&#x1F512;</span>
          </div>

          {/* Title */}
          <h2 style={styles.title}>Autorización Requerida</h2>
          <p style={styles.actionLabel}>{actionLabel}</p>
          <p style={styles.subtitle}>
            Ingresa el PIN de un Supervisor o Administrador
          </p>
          <p style={styles.requestedBy}>
            Solicitado por: <strong>{requestedBy}</strong>
          </p>

          {/* PIN dots */}
          <div style={styles.dotsRow}>
            {dots.map((dot, i) => (
              <span
                key={i}
                style={{
                  ...styles.dot,
                  color: i < pin.length ? 'var(--accent)' : 'var(--text-faint)',
                }}
              >
                {dot}
              </span>
            ))}
          </div>

          {/* Error message */}
          <div style={{ ...styles.errorMsg, opacity: error ? 1 : 0 }}>
            {error || '\u00A0'}
          </div>

          {/* Numeric keypad */}
          <div style={styles.keypad}>
            {['1','2','3','4','5','6','7','8','9'].map(d => (
              <button
                key={d}
                style={styles.keyBtn}
                onClick={() => handleDigit(d)}
                disabled={loading}
              >
                {d}
              </button>
            ))}
            <button
              style={{ ...styles.keyBtn, ...styles.keyBtnSecondary }}
              onClick={handleClear}
              disabled={loading}
            >
              Borrar
            </button>
            <button
              style={styles.keyBtn}
              onClick={() => handleDigit('0')}
              disabled={loading}
            >
              0
            </button>
            <button
              style={{ ...styles.keyBtn, ...styles.keyBtnConfirm }}
              onClick={() => handleSubmit(pin)}
              disabled={loading || pin.length !== PIN_LENGTH}
            >
              {loading ? '...' : 'OK'}
            </button>
          </div>

          {/* Cancel */}
          <button style={styles.cancelBtn} onClick={onCancel} disabled={loading}>
            Cancelar
          </button>
        </div>
      </div>
    </>
  );
}

/* ─── Keyframe animations injected via <style> ───────────────────────────── */
const keyframesCSS = `
@keyframes overrideFadeIn {
  from { opacity: 0; transform: scale(0.92); }
  to   { opacity: 1; transform: scale(1); }
}
@keyframes overrideShake {
  0%, 100% { transform: translateX(0); }
  15%  { transform: translateX(-12px); }
  30%  { transform: translateX(10px); }
  45%  { transform: translateX(-8px); }
  60%  { transform: translateX(6px); }
  75%  { transform: translateX(-3px); }
  90%  { transform: translateX(2px); }
}
`;

/* ─── Inline styles using CSS variables ───────────────────────────────────── */
const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'var(--overlay)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 300,
    backdropFilter: 'blur(4px)',
  },
  modal: {
    backgroundColor: 'var(--bg-secondary)',
    borderRadius: 24,
    padding: '36px 32px 28px',
    width: 380,
    maxWidth: '92vw',
    textAlign: 'center',
    boxShadow: '0 25px 60px var(--shadow)',
    border: '1px solid var(--border)',
  },
  lockIcon: {
    marginBottom: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: 800,
    color: 'var(--text-primary)',
    margin: '0 0 4px',
    letterSpacing: -0.3,
  },
  actionLabel: {
    fontSize: 15,
    fontWeight: 600,
    color: 'var(--accent)',
    margin: '0 0 8px',
  },
  subtitle: {
    fontSize: 13,
    color: 'var(--text-muted)',
    margin: '0 0 4px',
    lineHeight: 1.4,
  },
  requestedBy: {
    fontSize: 12,
    color: 'var(--text-faint)',
    margin: '0 0 20px',
  },
  dotsRow: {
    display: 'flex',
    justifyContent: 'center',
    gap: 14,
    marginBottom: 8,
  },
  dot: {
    fontSize: 28,
    lineHeight: 1,
    userSelect: 'none',
  },
  errorMsg: {
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--danger)',
    marginBottom: 16,
    minHeight: 20,
    transition: 'opacity 0.2s',
  },
  keypad: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 10,
    marginBottom: 20,
  },
  keyBtn: {
    height: 64,
    borderRadius: 14,
    border: '1px solid var(--border)',
    backgroundColor: 'var(--bg-card)',
    color: 'var(--text-primary)',
    fontSize: 22,
    fontWeight: 700,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    userSelect: 'none',
    WebkitTapHighlightColor: 'transparent',
    transition: 'background-color 0.1s, transform 0.1s',
  },
  keyBtnSecondary: {
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--text-muted)',
    backgroundColor: 'var(--bg-hover)',
  },
  keyBtnConfirm: {
    backgroundColor: 'var(--accent)',
    color: 'var(--accent-text)',
    border: 'none',
    fontSize: 16,
    fontWeight: 800,
  },
  cancelBtn: {
    width: '100%',
    padding: '14px 0',
    borderRadius: 14,
    border: '1px solid var(--border)',
    backgroundColor: 'transparent',
    color: 'var(--text-muted)',
    fontSize: 15,
    fontWeight: 600,
    cursor: 'pointer',
    letterSpacing: 0.2,
  },
};
