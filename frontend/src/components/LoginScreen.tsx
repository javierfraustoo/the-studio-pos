import React, { useEffect, useState } from 'react';
import { useStore } from '../store/useStore';
import type { UserInfo } from '../api';

export default function LoginScreen() {
  const { availableUsers, loadAvailableUsers, login } = useStore();
  const [selectedUser, setSelectedUser] = useState<UserInfo | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => { loadAvailableUsers(); }, []);

  const handleDigit = (d: string) => {
    if (pin.length >= 6) return;
    const next = pin + d;
    setPin(next);
    setError('');
    if (next.length === 6 && selectedUser) {
      submitPin(next);
    }
  };

  const handleDelete = () => { setPin(p => p.slice(0, -1)); setError(''); };

  const submitPin = async (p: string) => {
    if (!selectedUser) return;
    setLoading(true);
    const ok = await login(selectedUser.id, p);
    setLoading(false);
    if (!ok) {
      setPin('');
      setError('PIN incorrecto');
    }
  };

  const handleBack = () => { setSelectedUser(null); setPin(''); setError(''); };

  const roleLabel = (r: string) => {
    switch (r) {
      case 'admin': return 'Administrador';
      case 'manager': return 'Supervisor';
      case 'cashier': return 'Cajero';
      case 'barista': return 'Barista';
      case 'kitchen': return 'Cocina';
      default: return r;
    }
  };

  const roleColor = (r: string) => {
    switch (r) {
      case 'admin': return '#7C3AED';
      case 'manager': return '#D97706';
      case 'cashier': return '#2563EB';
      case 'barista': return '#78350F';
      case 'kitchen': return '#065F46';
      default: return '#6B7280';
    }
  };

  // User Selection
  if (!selectedUser) {
    return (
      <div style={styles.page}>
        <div style={styles.container}>
          <div style={styles.logo}>
            <span style={{ fontSize: 28, color: '#78350F' }}>&#9670;</span>
            <h1 style={styles.title}>THE STUDIO</h1>
            <span style={styles.badge}>POS</span>
          </div>
          <p style={styles.subtitle}>Selecciona tu usuario</p>
          <div style={styles.userGrid}>
            {availableUsers.map(u => (
              <button key={u.id} onClick={() => setSelectedUser(u)} style={styles.userBtn}>
                <div style={{ ...styles.userAvatar, backgroundColor: roleColor(u.role) }}>
                  {u.name.charAt(0).toUpperCase()}
                </div>
                <span style={styles.userName}>{u.name}</span>
                <span style={{ ...styles.userRole, color: roleColor(u.role) }}>{roleLabel(u.role)}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // PIN Entry
  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <button onClick={handleBack} style={styles.backBtn}>&#8592; Cambiar usuario</button>
        <div style={{ ...styles.userAvatar, backgroundColor: roleColor(selectedUser.role), width: 64, height: 64, fontSize: 28, margin: '0 auto 12px' }}>
          {selectedUser.name.charAt(0).toUpperCase()}
        </div>
        <h2 style={styles.pinTitle}>{selectedUser.name}</h2>
        <p style={styles.subtitle}>Ingresa tu PIN de 6 digitos</p>

        <div style={styles.pinDots}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={{ ...styles.dot, backgroundColor: i < pin.length ? '#1F2937' : '#E5E7EB' }} />
          ))}
        </div>

        {error && <p style={styles.error}>{error}</p>}
        {loading && <p style={styles.loading}>Verificando...</p>}

        <div style={styles.numpad}>
          {['1','2','3','4','5','6','7','8','9','','0','del'].map((key, i) => (
            key === '' ? <div key={i} /> :
            key === 'del' ? (
              <button key={i} onClick={handleDelete} style={{ ...styles.numKey, backgroundColor: '#FEE2E2', color: '#DC2626' }}>
                &#9003;
              </button>
            ) : (
              <button key={i} onClick={() => handleDigit(key)} style={styles.numKey} disabled={loading}>
                {key}
              </button>
            )
          ))}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F9FAFB', fontFamily: "'Inter', system-ui, sans-serif" },
  container: { width: '100%', maxWidth: 420, padding: 32, textAlign: 'center' },
  logo: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 24 },
  title: { fontSize: 22, fontWeight: 800, color: '#111827', margin: 0, letterSpacing: 1 },
  badge: { fontSize: 11, fontWeight: 700, backgroundColor: '#1F2937', color: '#FFF', padding: '3px 8px', borderRadius: 4 },
  subtitle: { fontSize: 14, color: '#6B7280', margin: '0 0 24px' },
  userGrid: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 },
  userBtn: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: 20, borderRadius: 16, border: '2px solid #E5E7EB', backgroundColor: '#FFF', cursor: 'pointer', transition: 'all 0.15s' },
  userAvatar: { width: 48, height: 48, borderRadius: 24, color: '#FFF', fontSize: 22, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  userName: { fontSize: 14, fontWeight: 700, color: '#111827' },
  userRole: { fontSize: 11, fontWeight: 600 },
  backBtn: { background: 'none', border: 'none', fontSize: 14, color: '#6B7280', cursor: 'pointer', fontWeight: 600, marginBottom: 16, padding: 0 },
  pinTitle: { fontSize: 20, fontWeight: 800, color: '#111827', margin: '0 0 4px' },
  pinDots: { display: 'flex', gap: 12, justifyContent: 'center', margin: '24px 0 16px' },
  dot: { width: 18, height: 18, borderRadius: 9, transition: 'background-color 0.15s' },
  error: { color: '#DC2626', fontSize: 13, fontWeight: 600, margin: '0 0 8px' },
  loading: { color: '#6B7280', fontSize: 13, margin: '0 0 8px' },
  numpad: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, maxWidth: 280, margin: '0 auto' },
  numKey: { height: 64, borderRadius: 16, border: '1px solid #E5E7EB', backgroundColor: '#FFF', fontSize: 24, fontWeight: 700, cursor: 'pointer', color: '#1F2937', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.1s' },
};
