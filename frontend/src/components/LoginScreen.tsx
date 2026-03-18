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

  const roleLabel = (u: UserInfo) => {
    if (u.role === 'admin') return 'Administrador';
    if (u.role === 'supervisor') return 'Supervisor';
    if (u.role === 'operador') {
      if (u.operator_type === 'cajero') return 'Cajero';
      if (u.operator_type === 'barista') return 'Barista';
      if (u.operator_type === 'cocina') return 'Cocina';
      return 'Operador';
    }
    return u.role;
  };

  const roleColor = (u: UserInfo) => {
    if (u.role === 'admin') return '#7C3AED';
    if (u.role === 'supervisor') return '#D97706';
    if (u.operator_type === 'cajero') return '#2563EB';
    if (u.operator_type === 'barista') return '#D97706';
    if (u.operator_type === 'cocina') return '#10B981';
    return '#A1A1AA';
  };

  // User Selection
  if (!selectedUser) {
    return (
      <div style={styles.page}>
        <div style={styles.container}>
          <div style={styles.logo}>
            <span style={{ fontSize: 28, color: '#10B981' }}>&#9670;</span>
            <h1 style={styles.title}>THE STUDIO</h1>
            <span style={styles.badge}>POS</span>
          </div>
          <p style={styles.subtitle}>Selecciona tu usuario</p>
          <div style={styles.userGrid}>
            {availableUsers.map(u => (
              <button key={u.id} onClick={() => setSelectedUser(u)} style={styles.userBtn}>
                <div style={{ ...styles.userAvatar, backgroundColor: roleColor(u) }}>
                  {u.name.charAt(0).toUpperCase()}
                </div>
                <span style={styles.userName}>{u.name}</span>
                <span style={{ ...styles.userRole, color: roleColor(u) }}>{roleLabel(u)}</span>
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
        <div style={{ ...styles.userAvatar, backgroundColor: roleColor(selectedUser), width: 64, height: 64, fontSize: 28, margin: '0 auto 12px' }}>
          {selectedUser.name.charAt(0).toUpperCase()}
        </div>
        <h2 style={styles.pinTitle}>{selectedUser.name}</h2>
        <p style={styles.subtitle}>Ingresa tu PIN de 6 digitos</p>

        <div style={styles.pinDots}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={{ ...styles.dot, backgroundColor: i < pin.length ? '#10B981' : '#3F3F46' }} />
          ))}
        </div>

        {error && <p style={styles.error}>{error}</p>}
        {loading && <p style={styles.loading}>Verificando...</p>}

        <div style={styles.numpad}>
          {['1','2','3','4','5','6','7','8','9','','0','del'].map((key, i) => (
            key === '' ? <div key={i} /> :
            key === 'del' ? (
              <button key={i} onClick={handleDelete} style={{ ...styles.numKey, backgroundColor: 'rgba(239,68,68,0.12)', color: '#EF4444' }}>
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
  page: { height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#09090B', fontFamily: "'Inter', system-ui, sans-serif" },
  container: { width: '100%', maxWidth: 420, padding: 32, textAlign: 'center' },
  logo: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 24 },
  title: { fontSize: 22, fontWeight: 800, color: '#FAFAFA', margin: 0, letterSpacing: 1 },
  badge: { fontSize: 11, fontWeight: 700, backgroundColor: '#10B981', color: '#FAFAFA', padding: '3px 8px', borderRadius: 4 },
  subtitle: { fontSize: 14, color: '#A1A1AA', margin: '0 0 24px' },
  userGrid: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 },
  userBtn: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: 20, borderRadius: 16, border: '1px solid rgba(255,255,255,0.06)', backgroundColor: '#18181B', cursor: 'pointer', transition: 'all 0.15s' },
  userAvatar: { width: 48, height: 48, borderRadius: 24, color: '#FAFAFA', fontSize: 22, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  userName: { fontSize: 14, fontWeight: 700, color: '#FAFAFA' },
  userRole: { fontSize: 11, fontWeight: 600 },
  backBtn: { background: 'none', border: 'none', fontSize: 14, color: '#A1A1AA', cursor: 'pointer', fontWeight: 600, marginBottom: 16, padding: 0 },
  pinTitle: { fontSize: 20, fontWeight: 800, color: '#FAFAFA', margin: '0 0 4px' },
  pinDots: { display: 'flex', gap: 12, justifyContent: 'center', margin: '24px 0 16px' },
  dot: { width: 18, height: 18, borderRadius: 9, transition: 'background-color 0.15s' },
  error: { color: '#EF4444', fontSize: 13, fontWeight: 600, margin: '0 0 8px' },
  loading: { color: '#A1A1AA', fontSize: 13, margin: '0 0 8px' },
  numpad: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, maxWidth: 280, margin: '0 auto' },
  numKey: { height: 64, borderRadius: 16, border: '1px solid rgba(255,255,255,0.06)', backgroundColor: '#18181B', fontSize: 24, fontWeight: 700, cursor: 'pointer', color: '#FAFAFA', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.1s' },
};
