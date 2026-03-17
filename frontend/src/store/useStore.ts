import { create } from 'zustand';
import * as api from '../api';
import type {
  Category, Product, ModifierGroup, ModifierRecipeAdjustment,
  Order, InventoryItem, KdsItem, WasteLog, Analytics, UserInfo,
} from '../api';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CartItemModifier {
  id: string; name: string; shortName: string; priceAdjustment: number;
}

export interface CartItem {
  cartItemId: string;
  product: Product;
  quantity: number;
  modifiers: CartItemModifier[];
  notes: string;
  unitPrice: number;
  modifiersTotal: number;
  lineTotal: number;
}

export type TabId = 'pos' | 'orders' | 'inventory' | 'kds' | 'waste' | 'analytics' | 'admin';

interface POSStore {
  // ── Auth ──
  currentUser: UserInfo | null;
  isAuthenticated: boolean;
  availableUsers: UserInfo[];
  login: (userId: string, pin: string) => Promise<boolean>;
  logout: () => void;
  loadAvailableUsers: () => Promise<void>;

  // ── Menu Data (from API) ──
  categories: Category[];
  products: Product[];
  modifierGroups: ModifierGroup[];
  modifierRecipeAdjustments: ModifierRecipeAdjustment[];
  menuLoaded: boolean;

  // ── Cart (local) ──
  cart: CartItem[];
  addToCart: (product: Product, modifiers: CartItemModifier[], notes?: string) => void;
  removeFromCart: (cartItemId: string) => void;
  updateQuantity: (cartItemId: string, delta: number) => void;
  clearCart: () => void;
  cartSubtotal: () => number;

  // ── Orders (from API) ──
  orders: Order[];
  fetchOrders: () => Promise<void>;
  processOrder: (paymentMethod: string, customerName: string, orderType: string) => Promise<Order | null>;

  // ── Inventory (from API) ──
  inventory: InventoryItem[];
  fetchInventory: () => Promise<void>;

  // ── KDS (from API) ──
  kdsItems: KdsItem[];
  fetchKdsItems: (station: string) => Promise<void>;
  addKdsItem: (item: KdsItem) => void;
  updateKdsItemLocal: (item: KdsItem) => void;
  markKdsReady: (itemId: string) => Promise<void>;
  markKdsDelivered: (itemId: string) => Promise<void>;

  // ── Waste (from API) ──
  wasteLogs: WasteLog[];
  fetchWaste: () => Promise<void>;
  registerWaste: (data: api.CreateWastePayload) => Promise<void>;

  // ── Analytics (from API) ──
  analytics: Analytics | null;
  fetchAnalytics: () => Promise<void>;

  // ── Simulators (local) ──
  printerLogs: Array<{ id: string; type: string; content: string; orderNumber: number }>;
  cashDrawerOpen: boolean;
  setCashDrawerOpen: (open: boolean) => void;
  paymentTerminalStatus: 'idle' | 'processing' | 'approved';
  simulatePayment: (method: string) => Promise<void>;

  // ── UI State ──
  selectedCategory: string;
  setSelectedCategory: (id: string) => void;
  modifierSheetProduct: Product | null;
  openModifierSheet: (product: Product) => void;
  closeModifierSheet: () => void;
  activeTab: TabId;
  setActiveTab: (tab: TabId) => void;
  showSimulators: boolean;
  toggleSimulators: () => void;
  darkMode: boolean;
  toggleDarkMode: () => void;

  // ── Init ──
  init: () => Promise<void>;
  reloadMenu: () => Promise<void>;
}

let cartIdCounter = 0;
function nextCartId() { return `ci-${++cartIdCounter}`; }

function generateReceiptText(order: Order): string {
  const W = 48;
  const sep = '-'.repeat(W);
  const center = (s: string) => ' '.repeat(Math.max(0, Math.floor((W - s.length) / 2))) + s;
  const cols = (l: string, r: string) => l + ' '.repeat(Math.max(1, W - l.length - r.length)) + r;

  const lines: string[] = [];
  lines.push(center('THE STUDIO COFFEE'));
  lines.push(center('Specialty Coffee & More'));
  lines.push(sep);
  lines.push(center(`ORDEN #${order.order_number}`));
  if (order.customer_name) lines.push(center(`Cliente: ${order.customer_name}`));
  lines.push(center(order.order_type === 'to_go' ? 'PARA LLEVAR' : 'EN TIENDA'));
  lines.push(center(new Date(order.created_at).toLocaleString('es-MX')));
  lines.push(sep);
  for (const item of order.items) {
    lines.push(cols(`${item.quantity}x ${item.product_name}`, `$${(item.unit_price * item.quantity).toFixed(2)}`));
    for (const m of item.modifiers) {
      if (m.priceAdjustment > 0) lines.push(cols(`   + ${m.name}`, `+$${m.priceAdjustment.toFixed(2)}`));
      else lines.push(`   + ${m.name}`);
    }
    if (item.notes) lines.push(`   >> ${item.notes}`);
  }
  lines.push(sep);
  lines.push(cols('TOTAL', `$${order.total.toFixed(2)}`));
  lines.push(cols('Pago', order.payment_method === 'cash' ? 'Efectivo' : 'Tarjeta'));
  lines.push('='.repeat(W));
  lines.push('');
  lines.push(center('Gracias por tu visita'));
  return lines.join('\n');
}

function getStoredUser(): UserInfo | null {
  try {
    const s = localStorage.getItem('pos_user');
    return s ? JSON.parse(s) : null;
  } catch { return null; }
}

export const useStore = create<POSStore>((set, get) => ({
  // ── Auth ──
  currentUser: getStoredUser(),
  isAuthenticated: !!api.getAuthToken() && !!getStoredUser(),
  availableUsers: [],
  login: async (userId, pin) => {
    try {
      const { token, user } = await api.loginWithPin(userId, pin);
      api.setAuthToken(token);
      const userWithType: api.UserInfo = {
        id: user.id, name: user.name, role: user.role,
        operator_type: (user as any).operator_type,
      };
      localStorage.setItem('pos_user', JSON.stringify(userWithType));
      set({ currentUser: userWithType, isAuthenticated: true });
      return true;
    } catch {
      return false;
    }
  },
  logout: () => {
    api.setAuthToken(null);
    localStorage.removeItem('pos_user');
    set({ currentUser: null, isAuthenticated: false, menuLoaded: false });
  },
  loadAvailableUsers: async () => {
    const users = await api.fetchUsersList();
    set({ availableUsers: users });
  },

  // ── Menu ──
  categories: [],
  products: [],
  modifierGroups: [],
  modifierRecipeAdjustments: [],
  menuLoaded: false,

  // ── Cart ──
  cart: [],
  addToCart: (product, modifiers, notes = '') => {
    const modifiersTotal = modifiers.reduce((s, m) => s + m.priceAdjustment, 0);
    const item: CartItem = {
      cartItemId: nextCartId(),
      product, quantity: 1, modifiers, notes,
      unitPrice: product.price, modifiersTotal,
      lineTotal: product.price + modifiersTotal,
    };
    set((s) => ({ cart: [...s.cart, item] }));
  },
  removeFromCart: (id) => set((s) => ({ cart: s.cart.filter((i) => i.cartItemId !== id) })),
  updateQuantity: (id, delta) => set((s) => ({
    cart: s.cart
      .map((i) => i.cartItemId === id ? {
        ...i, quantity: Math.max(0, i.quantity + delta),
        lineTotal: (i.unitPrice + i.modifiersTotal) * Math.max(0, i.quantity + delta),
      } : i)
      .filter((i) => i.quantity > 0),
  })),
  clearCart: () => set({ cart: [] }),
  cartSubtotal: () => get().cart.reduce((s, i) => s + i.lineTotal, 0),

  // ── Orders ──
  orders: [],
  fetchOrders: async () => {
    try { const orders = await api.fetchOrders(); set({ orders }); } catch { /* */ }
  },
  processOrder: async (paymentMethod, customerName, orderType) => {
    const { cart, simulatePayment } = get();
    if (!cart.length) return null;
    await simulatePayment(paymentMethod);
    const payload: api.CreateOrderPayload = {
      items: cart.map((item) => ({
        productId: item.product.id, productName: item.product.name,
        quantity: item.quantity, unitPrice: item.unitPrice,
        modifiersTotal: item.modifiersTotal, lineTotal: item.lineTotal,
        notes: item.notes, modifiers: item.modifiers,
      })),
      paymentMethod, customerName, orderType,
    };
    const order = await api.createOrder(payload);
    const receiptText = generateReceiptText(order);
    const receiptLog = { id: `pl-${order.order_number}`, type: 'receipt', content: receiptText, orderNumber: order.order_number };
    set((s) => ({ cart: [], orders: [order, ...s.orders], printerLogs: [receiptLog, ...s.printerLogs] }));
    return order;
  },

  // ── Inventory ──
  inventory: [],
  fetchInventory: async () => { try { set({ inventory: await api.fetchInventory() }); } catch { /* */ } },

  // ── KDS ──
  kdsItems: [],
  fetchKdsItems: async (station) => { set({ kdsItems: await api.fetchKdsItems(station) }); },
  addKdsItem: (item) => set((s) => ({
    kdsItems: s.kdsItems.some((k) => k.id === item.id) ? s.kdsItems : [...s.kdsItems, item],
  })),
  updateKdsItemLocal: (updated) => set((s) => ({
    kdsItems: updated.status === 'delivered'
      ? s.kdsItems.filter((k) => k.id !== updated.id)
      : s.kdsItems.map((k) => k.id === updated.id ? updated : k),
  })),
  markKdsReady: async (itemId) => { await api.updateKdsItem(itemId, 'ready'); },
  markKdsDelivered: async (itemId) => { await api.updateKdsItem(itemId, 'delivered'); },

  // ── Waste ──
  wasteLogs: [],
  fetchWaste: async () => { try { set({ wasteLogs: await api.fetchWaste() }); } catch { /* */ } },
  registerWaste: async (data) => {
    const log = await api.createWaste(data);
    set((s) => ({ wasteLogs: [log, ...s.wasteLogs] }));
  },

  // ── Analytics ──
  analytics: null,
  fetchAnalytics: async () => { try { set({ analytics: await api.fetchAnalytics() }); } catch { /* */ } },

  // ── Simulators ──
  printerLogs: [],
  cashDrawerOpen: false,
  setCashDrawerOpen: (open) => set({ cashDrawerOpen: open }),
  paymentTerminalStatus: 'idle',
  simulatePayment: async (method) => {
    if (method === 'cash') {
      set({ cashDrawerOpen: true });
      setTimeout(() => set({ cashDrawerOpen: false }), 3000);
    } else {
      set({ paymentTerminalStatus: 'processing' });
      await new Promise((r) => setTimeout(r, 1200));
      set({ paymentTerminalStatus: 'approved' });
      setTimeout(() => set({ paymentTerminalStatus: 'idle' }), 2000);
    }
  },

  // ── UI State ──
  selectedCategory: '',
  setSelectedCategory: (id) => set({ selectedCategory: id }),
  modifierSheetProduct: null,
  openModifierSheet: (product) => set({ modifierSheetProduct: product }),
  closeModifierSheet: () => set({ modifierSheetProduct: null }),
  activeTab: 'pos',
  setActiveTab: (tab) => set({ activeTab: tab }),
  showSimulators: false,
  toggleSimulators: () => set((s) => ({ showSimulators: !s.showSimulators })),
  darkMode: localStorage.getItem('pos_dark_mode') === 'true',
  toggleDarkMode: () => set((s) => {
    const next = !s.darkMode;
    localStorage.setItem('pos_dark_mode', String(next));
    document.documentElement.setAttribute('data-theme', next ? 'dark' : 'light');
    return { darkMode: next };
  }),

  // ── Init ──
  init: async () => {
    if (get().menuLoaded) return;
    try {
      const menu = await api.fetchMenu();
      set({
        categories: menu.categories, products: menu.products,
        modifierGroups: menu.modifierGroups,
        modifierRecipeAdjustments: menu.modifierRecipeAdjustments,
        selectedCategory: menu.categories[0]?.id || '',
        menuLoaded: true,
      });
      get().fetchOrders(); get().fetchInventory(); get().fetchWaste(); get().fetchAnalytics();
    } catch (e) { console.error('Init failed:', e); }
  },

  reloadMenu: async () => {
    try {
      const menu = await api.fetchMenu();
      set({
        categories: menu.categories, products: menu.products,
        modifierGroups: menu.modifierGroups,
        modifierRecipeAdjustments: menu.modifierRecipeAdjustments,
      });
    } catch { /* */ }
  },
}));
