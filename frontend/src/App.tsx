import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useStore } from './store/useStore';
import type { TabId } from './store/useStore';
import * as api from './api';
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

function DarkModeToggle() {
  const { darkMode, toggleDarkMode } = useStore();
  return (
    <button onClick={toggleDarkMode} title={darkMode ? 'Modo Claro' : 'Modo Oscuro'}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: 10, border: '1px solid var(--border)', backgroundColor: 'var(--bg-hover)', cursor: 'pointer', color: 'var(--text-muted)' }}>
      {darkMode ? <Sun size={15} /> : <Moon size={15} />}
    </button>
  );
}

function isKdsOnlyUser(user: { role: string; operator_type?: string | null }) {
  return user.role === 'operador' && (user.operator_type === 'barista' || user.operator_type === 'cocina');
}

function canAccessTab(user: { role: string; operator_type?: string | null }, tabId: TabId): boolean {
  const { role, operator_type } = user;
  if (role === 'admin') return true;
  if (role === 'supervisor') return tabId !== 'admin';
  if (role === 'operador') {
    if (operator_type === 'barista' || operator_type === 'cocina') return tabId === 'kds' || tabId === 'waste';
    if (operator_type === 'cajero') return ['pos', 'kds', 'orders', 'waste'].includes(tabId);
  }
  return false;
}

const TAB_DEFS: Array<{ id: TabId; label: string; Icon: React.FC<any> }> = [
  { id: 'pos', label: 'POS', Icon: LayoutGrid },
  { id: 'kds', label: 'KDS', Icon: Monitor },
  { id: 'orders', label: 'Órdenes', Icon: ClipboardList },
  { id: 'inventory', label: 'Inventario', Icon: Package },
  { id: 'waste', label: 'Merma', Icon: Trash2 },
  { id: 'analytics', label: 'Análisis', Icon: BarChart3 },
  { id: 'admin', label: 'Admin', Icon: Settings },
];

function MainApp() {
  const {
    activeTab, setActiveTab, showSimulators, toggleSimulators, orders, init, menuLoaded,
    fetchOrders, fetchInventory, fetchAnalytics, inventory, kdsItems, wasteLogs,
    isAuthenticated, currentUser, logout, reloadMenu, darkMode,
  } = useStore();

  useEffect(() => { document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light'); }, [darkMode]);
  useEffect(() => { if (isAuthenticated) init(); }, [isAuthenticated]);
  useEffect(() => {
    const channel = subscribePosEvents({
      onOrderCreated: () => { fetchOrders(); fetchAnalytics(); },
      onWasteCreated: () => { fetchInventory(); fetchAnalytics(); },
      onMenuUpdated: () => { reloadMenu(); },
      onOrderComplete: () => { fetchOrders(); },
    });
    return () => { unsubscribe(channel); };
  }, []);

  // Fetch all KDS items for badge (both stations)
  const [allKdsForBadge, setAllKdsForBadge] = useState<api.KdsItem[]>([]);
  const refreshKdsBadge = useCallback(async () => {
    try {
      const [bar, kitchen] = await Promise.all([api.fetchKdsItems('bar'), api.fetchKdsItems('kitchen')]);
      setAllKdsForBadge([...bar, ...kitchen]);
    } catch { /* */ }
  }, []);
  useEffect(() => { if (isAuthenticated && menuLoaded) { refreshKdsBadge(); const id = setInterval(refreshKdsBadge, 30000); return () => clearInterval(id); } }, [isAuthenticated, menuLoaded]);

  // Smart badge counts
  const lowStockCount = useMemo(() => inventory.filter(i => i.stock <= i.minimumStock).length, [inventory]);
  const kdsOverdueCount = useMemo(() => {
    const now = Date.now();
    return allKdsForBadge.filter(i => i.status !== 'delivered' && (now - new Date(i.routed_at).getTime()) > 5 * 60 * 1000).length;
  }, [allKdsForBadge]);
  const kdsHasUrgent = useMemo(() => {
    const now = Date.now();
    return allKdsForBadge.some(i => i.status !== 'delivered' && (now - new Date(i.routed_at).getTime()) > 10 * 60 * 1000);
  }, [allKdsForBadge]);
  const wasteCount = useMemo(() => wasteLogs.length, [wasteLogs]);

  function getBadgeCount(tabId: TabId): number {
    if (tabId === 'inventory' && lowStockCount > 0) return lowStockCount;
    if (tabId === 'kds' && kdsOverdueCount > 0) return kdsOverdueCount;
    if (tabId === 'waste' && wasteCount > 4) return wasteCount;
    return 0;
  }

  if (!isAuthenticated) return <LoginScreen />;

  if (currentUser && isKdsOnlyUser(currentUser)) {
    const station = currentUser.operator_type === 'barista' ? 'bar' : 'kitchen';
    const title = currentUser.operator_type === 'barista' ? 'KDS Barra' : 'KDS Cocina';
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg-primary)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 20px', backgroundColor: 'var(--bg-header)', backdropFilter: 'blur(16px)', borderBottom: '1px solid var(--border)' }}>
          <span style={{ color: 'var(--text-primary)', fontSize: 14, fontWeight: 700, letterSpacing: '-0.01em' }}>{currentUser?.name} — {title}</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <DarkModeToggle />
            <button onClick={logout} style={{ padding: '6px 14px', borderRadius: 10, border: '1px solid var(--danger)', backgroundColor: 'transparent', color: 'var(--danger)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Salir</button>
          </div>
        </div>
        <div style={{ flex: 1 }}><KDSView station={station} title={title} /></div>
      </div>
    );
  }

  if (!menuLoaded) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', backgroundColor: 'var(--bg-primary)' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 36, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 12, letterSpacing: '-0.03em' }}>THE STUDIO</div>
          <div style={{ fontSize: 12, color: 'var(--text-faint)', fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase' as const }}>Conectando al servidor...</div>
        </div>
      </div>
    );
  }

  const roleLabel = currentUser?.role === 'admin' ? 'Admin' : currentUser?.role === 'supervisor' ? 'Supervisor'
    : currentUser?.operator_type === 'cajero' ? 'Cajero' : currentUser?.operator_type === 'barista' ? 'Barista'
    : currentUser?.operator_type === 'cocina' ? 'Cocina' : 'Op';

  const visibleTabs = currentUser ? TAB_DEFS.filter(t => canAccessTab(currentUser, t.id)) : [];
  const showHW = showSimulators && activeTab === 'pos';

  return (
    <div style={S.app}>
      <header style={S.header}>
        <div style={S.brand}>
          <div style={S.logoMark}>S</div>
          <span style={S.brandName}>THE STUDIO</span>
        </div>

        <nav style={S.nav}>
          {visibleTabs.map((t) => {
            const isActive = activeTab === t.id;
            const badgeCount = getBadgeCount(t.id);
            return (
              <button key={t.id} onClick={() => setActiveTab(t.id)}
                style={{
                  ...S.navBtn,
                  backgroundColor: isActive ? 'var(--accent-glow)' : 'transparent',
                  color: isActive ? 'var(--accent)' : 'var(--text-muted)',
                  borderColor: isActive ? 'rgba(16,185,129,0.2)' : 'transparent',
                }}>
                <t.Icon size={14} strokeWidth={isActive ? 2.5 : 2} />
                <span>{t.label}</span>
                {badgeCount > 0 && (
                  <span style={{ ...S.badge, backgroundColor: t.id === 'kds' ? (kdsHasUrgent ? '#EF4444' : '#F59E0B') : t.id === 'inventory' ? '#EF4444' : '#6366F1' }}>
                    {badgeCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div style={S.headerRight}>
          <div style={S.userPill}>
            <div style={S.userAvatar}>{currentUser?.name?.charAt(0) || 'U'}</div>
            <span style={S.userName}>{currentUser?.name}</span>
            <span style={S.userRole}>{roleLabel}</span>
          </div>
          <DarkModeToggle />
          <button onClick={toggleSimulators} style={S.iconBtn} title="Simuladores"><Cpu size={14} /></button>
          <button onClick={logout} style={S.logoutBtn}><LogOut size={14} /></button>
        </div>
      </header>

      <div style={S.mainArea}>
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

const S: Record<string, React.CSSProperties> = {
  app: { height: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg-primary)', fontFamily: "'Inter', -apple-system, system-ui, sans-serif" },

  header: {
    display: 'flex', alignItems: 'center', padding: '0 20px', height: 56,
    backgroundColor: 'var(--bg-header)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
    borderBottom: '1px solid var(--border)',
    gap: 16, flexShrink: 0, position: 'sticky' as const, top: 0, zIndex: 50,
  },

  brand: { display: 'flex', alignItems: 'center', gap: 10 },
  logoMark: {
    width: 30, height: 30, borderRadius: 10,
    background: 'linear-gradient(135deg, #10B981, #059669)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 14, fontWeight: 800, color: '#FFF', letterSpacing: -1,
  },
  brandName: { fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '0.04em' },

  nav: { display: 'flex', gap: 1, marginLeft: 16, flex: 1 },
  navBtn: {
    padding: '7px 14px', borderRadius: 10, border: '1px solid transparent',
    cursor: 'pointer', fontWeight: 500, fontSize: 13,
    display: 'flex', alignItems: 'center', gap: 6,
    transition: 'all 0.25s cubic-bezier(0.4,0,0.2,1)',
    whiteSpace: 'nowrap' as const,
  },
  badge: {
    fontSize: 9, fontWeight: 700, color: '#FFF',
    padding: '1px 5px', borderRadius: 20, marginLeft: 2, lineHeight: '13px',
    minWidth: 16, textAlign: 'center' as const,
  },

  headerRight: { display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 },
  userPill: {
    display: 'flex', alignItems: 'center', gap: 8, padding: '4px 12px 4px 4px',
    borderRadius: 20, backgroundColor: 'var(--bg-hover)',
    border: '1px solid var(--border)',
  },
  userAvatar: {
    width: 26, height: 26, borderRadius: 13,
    background: 'linear-gradient(135deg, #3B82F6, #6366F1)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 11, fontWeight: 700, color: '#FFF',
  },
  userName: { fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' },
  userRole: { fontSize: 10, color: 'var(--text-faint)', fontWeight: 500 },

  iconBtn: {
    width: 34, height: 34, borderRadius: 10, border: '1px solid var(--border)',
    backgroundColor: 'var(--bg-hover)', cursor: 'pointer', color: 'var(--text-muted)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  logoutBtn: {
    width: 34, height: 34, borderRadius: 10, border: '1px solid var(--danger-bg)',
    backgroundColor: 'var(--danger-bg)', cursor: 'pointer', color: 'var(--danger)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },

  mainArea: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
};
