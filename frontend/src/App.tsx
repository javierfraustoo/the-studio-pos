import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useStore } from './store/useStore';
import type { TabId } from './store/useStore';
import { subscribePosEvents, unsubscribe } from './realtime';

import LoginScreen from './components/LoginScreen';
import POSScreen from './components/POSScreen';
import KDSScreen from './components/KDSScreen';
import OrdersScreen from './components/OrdersScreen';
import InventoryScreen from './components/InventoryScreen';
import WasteScreen from './components/WasteScreen';
import AnalyticsScreen from './components/AnalyticsScreen';
import AdminScreen from './components/AdminScreen';
import KDSView from './components/KDSView';
import HardwareSimulators from './simulators/HardwareSimulators';

// ─── Dark Mode Toggle Switch ─────────────────────────────────────────────

function DarkModeToggle() {
  const { darkMode, toggleDarkMode } = useStore();
  return (
    <button
      onClick={toggleDarkMode}
      title={darkMode ? 'Modo Claro' : 'Modo Oscuro'}
      style={{
        display: 'flex', alignItems: 'center', gap: 4,
        padding: '5px 10px', borderRadius: 6,
        border: `1px solid var(--border)`,
        backgroundColor: 'transparent',
        cursor: 'pointer', fontSize: 13, fontWeight: 600,
        color: 'var(--text-muted)',
      }}
    >
      {darkMode ? '☀' : '🌙'}
    </button>
  );
}

// ─── Role helper functions ───────────────────────────────────────────────

function isKdsOnlyUser(user: { role: string; operator_type?: string | null }) {
  return user.role === 'operador' && (user.operator_type === 'barista' || user.operator_type === 'cocina');
}

function canAccessTab(user: { role: string; operator_type?: string | null }, tabId: TabId): boolean {
  const { role, operator_type } = user;

  // Admin: full access
  if (role === 'admin') return true;

  // Supervisor: everything except admin panel
  if (role === 'supervisor') return tabId !== 'admin';

  // Operador depends on operator_type
  if (role === 'operador') {
    // Barista/Cocina: KDS + waste only (handled separately via redirect)
    if (operator_type === 'barista' || operator_type === 'cocina') {
      return tabId === 'kds' || tabId === 'waste';
    }
    // Cajero: POS, orders, waste, KDS
    if (operator_type === 'cajero') {
      return ['pos', 'kds', 'orders', 'waste'].includes(tabId);
    }
  }

  return false;
}

// ─── Main POS App (tabbed) ──────────────────────────────────────────────────

function MainApp() {
  const {
    activeTab, setActiveTab, showSimulators, toggleSimulators, orders, init, menuLoaded,
    addKdsItem, updateKdsItemLocal, fetchOrders, fetchInventory, fetchAnalytics,
    isAuthenticated, currentUser, logout, reloadMenu, darkMode,
  } = useStore();

  // Apply dark mode on mount and when toggled
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  useEffect(() => {
    if (isAuthenticated) init();
  }, [isAuthenticated]);

  // Supabase Realtime subscriptions (replaces Socket.io)
  useEffect(() => {
    const channel = subscribePosEvents({
      onOrderCreated: () => { fetchOrders(); fetchAnalytics(); },
      onWasteCreated: () => { fetchInventory(); fetchAnalytics(); },
      onMenuUpdated: () => { reloadMenu(); },
      onOrderComplete: () => { fetchOrders(); },
    });

    return () => {
      unsubscribe(channel);
    };
  }, []);

  // Not logged in → show login
  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  // Barista/Cocina auto-redirect to their KDS
  if (currentUser && isKdsOnlyUser(currentUser)) {
    const station = currentUser.operator_type === 'barista' ? 'bar' : 'kitchen';
    const title = currentUser.operator_type === 'barista' ? 'KDS Barra' : 'KDS Cocina';
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px', backgroundColor: 'var(--accent)' }}>
          <span style={{ color: '#FFF', fontSize: 14, fontWeight: 700 }}>{currentUser?.name} — {title}</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <DarkModeToggle />
            <button onClick={logout} style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid #FCA5A5', backgroundColor: 'transparent', color: '#FCA5A5', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Salir</button>
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <KDSView station={station} title={title} />
        </div>
      </div>
    );
  }

  // Loading menu
  if (!menuLoaded) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'Inter, sans-serif', backgroundColor: 'var(--bg-primary)' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 8 }}>THE STUDIO POS</div>
          <div style={{ color: 'var(--text-faint)' }}>Conectando al servidor...</div>
        </div>
      </div>
    );
  }

  // Role label for display
  const roleLabel = currentUser?.role === 'admin' ? 'Administrador'
    : currentUser?.role === 'supervisor' ? 'Supervisor'
    : currentUser?.operator_type === 'cajero' ? 'Cajero'
    : currentUser?.operator_type === 'barista' ? 'Barista'
    : currentUser?.operator_type === 'cocina' ? 'Cocina'
    : 'Operador';

  const tabs: Array<{ id: TabId; label: string; icon: string }> = [
    { id: 'pos', label: 'POS', icon: '▢' },
    { id: 'kds', label: 'KDS', icon: '📺' },
    { id: 'orders', label: 'Ordenes', icon: '☰' },
    { id: 'inventory', label: 'Inventario', icon: '⚙' },
    { id: 'waste', label: 'Merma', icon: '🗑' },
    { id: 'analytics', label: 'Analisis', icon: '📊' },
    { id: 'admin', label: 'Admin', icon: '🔧' },
  ];

  const visibleTabs = currentUser ? tabs.filter(t => canAccessTab(currentUser, t.id)) : [];

  const showHW = showSimulators && activeTab === 'pos';

  return (
    <div style={styles.app}>
      <header style={styles.header}>
        <div style={styles.brand}>
          <span style={styles.diamond}>&#9670;</span>
          <span style={styles.brandName}>THE STUDIO</span>
          <span style={styles.posBadge}>POS</span>
          <span style={styles.version}>v4</span>
        </div>
        <nav style={styles.nav}>
          {visibleTabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              style={{
                ...styles.navBtn,
                backgroundColor: activeTab === t.id ? 'var(--accent)' : 'transparent',
                color: activeTab === t.id ? 'var(--accent-text)' : 'var(--text-muted)',
              }}
            >
              {t.icon} {t.label}
              {t.id === 'orders' && orders.length > 0 && (
                <span style={styles.badge}>{orders.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div style={styles.headerRight}>
          <span style={styles.userInfo}>{currentUser?.name} ({roleLabel})</span>
          <DarkModeToggle />
          <button onClick={toggleSimulators} style={styles.hwToggle}>
            {showSimulators ? 'Ocultar' : 'HW'}
          </button>
          <button onClick={logout} style={styles.logoutBtn}>Salir</button>
        </div>
      </header>

      <div style={styles.mainArea}>
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
          {activeTab === 'pos' && <POSScreen />}
          {activeTab === 'kds' && <KDSScreen />}
          {activeTab === 'orders' && <OrdersScreen />}
          {activeTab === 'inventory' && <InventoryScreen />}
          {activeTab === 'waste' && <WasteScreen />}
          {activeTab === 'analytics' && <AnalyticsScreen />}
          {activeTab === 'admin' && <AdminScreen />}
        </div>
        {showHW && (
          <div style={{ height: 280, borderTop: '1px solid var(--border)', flexShrink: 0 }}>
            <HardwareSimulators />
          </div>
        )}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MainApp />} />
        <Route path="/admin" element={<MainApp />} />
        <Route path="/kds/barra" element={<KDSView station="bar" title="KDS Barra" />} />
        <Route path="/kds/cocina" element={<KDSView station="kitchen" title="KDS Cocina" />} />
      </Routes>
    </BrowserRouter>
  );
}

const styles: Record<string, React.CSSProperties> = {
  app: { height: '100vh', display: 'flex', flexDirection: 'column', fontFamily: "'Inter', system-ui, sans-serif", backgroundColor: 'var(--bg-primary)' },
  header: { display: 'flex', alignItems: 'center', padding: '0 16px', height: 52, backgroundColor: 'var(--bg-header)', borderBottom: '1px solid var(--border)', gap: 12, flexShrink: 0 },
  brand: { display: 'flex', alignItems: 'center', gap: 6 },
  diamond: { fontSize: 18, color: '#78350F' },
  brandName: { fontSize: 14, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: 0.5 },
  posBadge: { fontSize: 10, fontWeight: 700, backgroundColor: 'var(--accent)', color: 'var(--accent-text)', padding: '2px 6px', borderRadius: 4 },
  version: { fontSize: 10, color: 'var(--text-faint)' },
  nav: { display: 'flex', gap: 2, marginLeft: 8, flex: 1, flexWrap: 'wrap' },
  navBtn: { padding: '6px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 4, transition: 'all 0.15s', position: 'relative' as const, whiteSpace: 'nowrap' as const },
  badge: { fontSize: 10, fontWeight: 700, backgroundColor: '#EF4444', color: '#FFF', padding: '1px 5px', borderRadius: 8, marginLeft: 2 },
  headerRight: { display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 },
  userInfo: { fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 },
  hwToggle: { padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border)', backgroundColor: 'transparent', cursor: 'pointer', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' },
  logoutBtn: { padding: '5px 10px', borderRadius: 6, border: '1px solid #FCA5A5', backgroundColor: 'transparent', cursor: 'pointer', fontSize: 11, fontWeight: 600, color: '#DC2626' },
  mainArea: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
};
