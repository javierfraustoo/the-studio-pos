import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useStore } from './store/useStore';
import type { TabId } from './store/useStore';
import { subscribePosEvents, unsubscribe } from './realtime';
import {
  Sun, Moon, LayoutGrid, Monitor, ClipboardList, Package,
  Trash2, BarChart3, Settings, LogOut, Cpu,
} from 'lucide-react';

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
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 34, height: 34, borderRadius: 8,
        border: '1px solid var(--border)',
        backgroundColor: 'transparent',
        cursor: 'pointer', color: 'var(--text-muted)',
        transition: 'all 0.2s ease',
      }}
    >
      {darkMode ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}

// ─── Role helper functions ───────────────────────────────────────────────

function isKdsOnlyUser(user: { role: string; operator_type?: string | null }) {
  return user.role === 'operador' && (user.operator_type === 'barista' || user.operator_type === 'cocina');
}

function canAccessTab(user: { role: string; operator_type?: string | null }, tabId: TabId): boolean {
  const { role, operator_type } = user;
  if (role === 'admin') return true;
  if (role === 'supervisor') return tabId !== 'admin';
  if (role === 'operador') {
    if (operator_type === 'barista' || operator_type === 'cocina') {
      return tabId === 'kds' || tabId === 'waste';
    }
    if (operator_type === 'cajero') {
      return ['pos', 'kds', 'orders', 'waste'].includes(tabId);
    }
  }
  return false;
}

// ─── Tab config with Lucide Icons ───────────────────────────────────────

const TAB_DEFS: Array<{ id: TabId; label: string; Icon: React.FC<any> }> = [
  { id: 'pos', label: 'POS', Icon: LayoutGrid },
  { id: 'kds', label: 'KDS', Icon: Monitor },
  { id: 'orders', label: 'Órdenes', Icon: ClipboardList },
  { id: 'inventory', label: 'Inventario', Icon: Package },
  { id: 'waste', label: 'Merma', Icon: Trash2 },
  { id: 'analytics', label: 'Análisis', Icon: BarChart3 },
  { id: 'admin', label: 'Admin', Icon: Settings },
];

// ─── Main POS App ────────────────────────────────────────────────────────

function MainApp() {
  const {
    activeTab, setActiveTab, showSimulators, toggleSimulators, orders, init, menuLoaded,
    addKdsItem, updateKdsItemLocal, fetchOrders, fetchInventory, fetchAnalytics,
    isAuthenticated, currentUser, logout, reloadMenu, darkMode,
  } = useStore();

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  useEffect(() => {
    if (isAuthenticated) init();
  }, [isAuthenticated]);

  useEffect(() => {
    const channel = subscribePosEvents({
      onOrderCreated: () => { fetchOrders(); fetchAnalytics(); },
      onWasteCreated: () => { fetchInventory(); fetchAnalytics(); },
      onMenuUpdated: () => { reloadMenu(); },
      onOrderComplete: () => { fetchOrders(); },
    });
    return () => { unsubscribe(channel); };
  }, []);

  if (!isAuthenticated) return <LoginScreen />;

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
        <div style={{ flex: 1 }}><KDSView station={station} title={title} /></div>
      </div>
    );
  }

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

  const roleLabel = currentUser?.role === 'admin' ? 'Administrador'
    : currentUser?.role === 'supervisor' ? 'Supervisor'
    : currentUser?.operator_type === 'cajero' ? 'Cajero'
    : currentUser?.operator_type === 'barista' ? 'Barista'
    : currentUser?.operator_type === 'cocina' ? 'Cocina' : 'Operador';

  const visibleTabs = currentUser ? TAB_DEFS.filter(t => canAccessTab(currentUser, t.id)) : [];
  const showHW = showSimulators && activeTab === 'pos';

  return (
    <div style={styles.app}>
      <header style={styles.header}>
        <div style={styles.brand}>
          <span style={styles.diamond}>&#9670;</span>
          <span style={styles.brandName}>THE STUDIO</span>
          <span style={styles.posBadge}>POS</span>
        </div>
        <nav style={styles.nav}>
          {visibleTabs.map((t) => {
            const isActive = activeTab === t.id;
            return (
              <button key={t.id} onClick={() => setActiveTab(t.id)}
                style={{ ...styles.navBtn, backgroundColor: isActive ? 'var(--accent)' : 'transparent', color: isActive ? 'var(--accent-text)' : 'var(--text-muted)' }}>
                <t.Icon size={15} strokeWidth={2.2} />
                <span>{t.label}</span>
                {t.id === 'orders' && orders.length > 0 && <span style={styles.badge}>{orders.length}</span>}
              </button>
            );
          })}
        </nav>
        <div style={styles.headerRight}>
          <span style={styles.userInfo}>{currentUser?.name} ({roleLabel})</span>
          <DarkModeToggle />
          <button onClick={toggleSimulators} style={styles.hwToggle} title="Simuladores"><Cpu size={14} /></button>
          <button onClick={logout} style={styles.logoutBtn}><LogOut size={14} /><span>Salir</span></button>
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
        {showHW && <div style={{ height: 280, borderTop: '1px solid var(--border)', flexShrink: 0 }}><HardwareSimulators /></div>}
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
  header: { display: 'flex', alignItems: 'center', padding: '0 20px', height: 56, backgroundColor: 'var(--bg-header)', borderBottom: '2px solid var(--border)', gap: 16, flexShrink: 0 },
  brand: { display: 'flex', alignItems: 'center', gap: 6 },
  diamond: { fontSize: 20, color: '#B45309' },
  brandName: { fontSize: 15, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: 1 },
  posBadge: { fontSize: 10, fontWeight: 700, backgroundColor: 'var(--accent)', color: 'var(--accent-text)', padding: '2px 7px', borderRadius: 4 },
  nav: { display: 'flex', gap: 2, marginLeft: 12, flex: 1, flexWrap: 'wrap' },
  navBtn: { padding: '8px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.2s ease', position: 'relative' as const, whiteSpace: 'nowrap' as const },
  badge: { fontSize: 10, fontWeight: 700, backgroundColor: '#EF4444', color: '#FFF', padding: '1px 6px', borderRadius: 8, marginLeft: 2 },
  headerRight: { display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 },
  userInfo: { fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 },
  hwToggle: { width: 34, height: 34, borderRadius: 8, border: '1px solid var(--border)', backgroundColor: 'transparent', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s ease' },
  logoutBtn: { padding: '6px 12px', borderRadius: 8, border: '1px solid var(--danger)', backgroundColor: 'transparent', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: 4, transition: 'all 0.2s ease' },
  mainArea: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
};
