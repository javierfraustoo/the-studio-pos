// ─── API Service ──────────────────────────────────────────────────────────

const BASE = '';

// Auth token management
let authToken: string | null = localStorage.getItem('pos_token');

export function setAuthToken(token: string | null) {
  authToken = token;
  if (token) localStorage.setItem('pos_token', token);
  else localStorage.removeItem('pos_token');
}

export function getAuthToken() { return authToken; }

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

  const res = await fetch(`${BASE}${url}`, { headers, ...options });

  if (res.status === 401) {
    setAuthToken(null);
    localStorage.removeItem('pos_user');
    window.location.reload();
    throw new Error('Session expired');
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

// ─── Auth ───────────────────────────────────────────────────────────────

export interface UserInfo { id: string; name: string; role: string; operator_type?: string; }
export function fetchUsersList() { return request<UserInfo[]>('/api/auth/users-list'); }
export function loginWithPin(userId: string, pin: string) {
  return request<{ token: string; user: UserInfo }>('/api/auth/login', {
    method: 'POST', body: JSON.stringify({ userId, pin }),
  });
}
export function verifyOverride(pin: string, action: string, details?: any) {
  return request<{ authorized: boolean; overrideUser?: { id: string; name: string; role: string } }>('/api/auth/verify-override', {
    method: 'POST',
    body: JSON.stringify({ pin, action, details }),
  });
}

// ─── Menu ────────────────────────────────────────────────────────────────

export interface Category {
  id: string; name: string; color: string; icon: string; kds_station: string; sort_order: number;
}
export interface Modifier {
  id: string; name: string; shortName: string; priceAdjustment: number; isDefault: boolean;
}
export interface ModifierGroup {
  id: string; name: string; selectionType: 'single' | 'multiple';
  isRequired: boolean; minSelections: number; maxSelections: number;
  modifiers: Modifier[];
}
export interface RecipeLine { inventory_item_id: string; quantity: number; }
export interface Product {
  id: string; name: string; short_name: string; price: number;
  category_id: string; modifierGroupIds: string[]; recipe: RecipeLine[];
}
export interface ModifierRecipeAdjustment {
  modifierId: string; inventoryItemId: string; quantity: number;
  replacesInventoryItemId: string | null;
}
export interface MenuData {
  categories: Category[]; products: Product[];
  modifierGroups: ModifierGroup[];
  modifierRecipeAdjustments: ModifierRecipeAdjustment[];
}
export function fetchMenu() { return request<MenuData>('/api/menu'); }

// ─── Inventory ───────────────────────────────────────────────────────────

export interface InventoryBatch {
  id: number; quantity_received: number; quantity_remaining: number;
  cost_per_unit: number; received_at: string; expires_at: string | null;
}
export interface InventoryItem {
  id: string; name: string; unit: string; isPerishable: boolean;
  minimumStock: number; stock: number; batches: InventoryBatch[];
}
export function fetchInventory() { return request<InventoryItem[]>('/api/inventory'); }

export function receiveInventory(data: { inventoryItemId: string; quantity: number; costPerUnit: number; expiresAt?: string }) {
  return request<{ ok: boolean }>('/api/inventory/receive', { method: 'POST', body: JSON.stringify(data) });
}

// ─── Orders ──────────────────────────────────────────────────────────────

export interface OrderItemModifier {
  id: string; name: string; shortName: string; priceAdjustment: number;
}
export interface OrderItem {
  id: number; order_id: string; product_id: string; product_name: string;
  quantity: number; unit_price: number; modifiers_total: number;
  line_total: number; notes: string; modifiers: OrderItemModifier[];
}
export interface Order {
  id: string; order_number: number; customer_name: string;
  order_type: string; payment_method: string;
  subtotal: number; total: number; created_at: string;
  user_name?: string; status?: string;
  discount?: number; discount_authorized_by?: string;
  items: OrderItem[];
}
export interface CreateOrderItem {
  productId: string; productName: string; quantity: number;
  unitPrice: number; modifiersTotal: number; lineTotal: number;
  notes: string; modifiers: OrderItemModifier[];
}
export interface CreateOrderPayload {
  items: CreateOrderItem[]; paymentMethod: string;
  customerName: string; orderType: string;
}
export function fetchOrders(date?: string) {
  const q = date ? `?date=${date}` : '';
  return request<Order[]>(`/api/orders${q}`);
}
export function createOrder(payload: CreateOrderPayload) {
  return request<Order & { kdsItems: KdsItem[] }>('/api/orders', {
    method: 'POST', body: JSON.stringify(payload),
  });
}
export function cancelOrder(orderId: string, authorizedBy?: string) {
  return request<{ ok: boolean }>(`/api/orders/${orderId}/cancel`, {
    method: 'PATCH',
    body: JSON.stringify({ authorizedBy }),
  });
}

// ─── KDS ─────────────────────────────────────────────────────────────────

export interface KdsItem {
  id: string; order_id: string; order_item_id: number; order_number: number;
  customer_name: string; order_type: string; product_name: string;
  quantity: number; modifiers: string[]; notes: string;
  station: string; status: string; routed_at: string;
  ready_at: string | null; delivered_at: string | null;
}
export function fetchKdsItems(station: string) {
  return request<KdsItem[]>(`/api/kds/${station}`);
}
export function fetchKdsHistory(station: string) {
  return request<KdsItem[]>(`/api/kds/${station}/history`);
}
export function updateKdsItem(itemId: string, status: string) {
  return request<{ ok: boolean; item: KdsItem | null }>(`/api/kds/${itemId}`, {
    method: 'PATCH', body: JSON.stringify({ status }),
  });
}

// ─── Waste ───────────────────────────────────────────────────────────────

export interface WasteLog {
  id: string; item_type: string; item_id: string; item_name: string;
  quantity: number; unit: string; reason: string; notes: string;
  total_cost: number; user_name?: string; created_at: string;
}
export interface CreateWastePayload {
  itemType: string; itemId: string; quantity: number;
  reason: string; notes: string;
}
export function fetchWaste(date?: string) {
  const q = date ? `?date=${date}` : '';
  return request<WasteLog[]>(`/api/waste${q}`);
}
export function createWaste(payload: CreateWastePayload) {
  return request<WasteLog>('/api/waste', {
    method: 'POST', body: JSON.stringify(payload),
  });
}

// ─── Analytics ───────────────────────────────────────────────────────────

export interface HourlyData { hour: number; revenue: number; orders: number; }
export interface Analytics {
  revenue: number; orderCount: number; avgTicket: number; wasteCost: number;
  recipeCost: number; wastePercent: number;
  topSellers: Array<{ product_name: string; product_id: string; totalQty: number; totalRevenue: number }>;
  profitability: Array<{ id: string; name: string; price: number; recipeCost: number; margin: number }>;
  hourlyData: HourlyData[];
  top5Profitable: Array<{ id: string; name: string; price: number; recipeCost: number; margin: number }>;
}
export function fetchAnalytics(date?: string) {
  const q = date ? `?date=${date}` : '';
  return request<Analytics>(`/api/analytics${q}`);
}

export interface AnalyticsOrder {
  id: string; order_number: number; customer_name: string;
  order_type: string; payment_method: string; total: number;
  user_name: string; created_at: string;
  items: OrderItem[]; recipeCost: number;
  prepTimeMinutes: number | null; grossMargin: number;
}
export function fetchAnalyticsOrders(date?: string) {
  const q = date ? `?date=${date}` : '';
  return request<AnalyticsOrder[]>(`/api/analytics/orders${q}`);
}

// ─── Audit ──────────────────────────────────────────────────────────────

export interface AuditEntry {
  id: number; user_id: string; user_name: string; action: string;
  entity_type: string; entity_id: string; details: string; created_at: string;
}
export interface AuditFilters {
  limit?: number; offset?: number; action?: string; userId?: string;
  entityType?: string; role?: string; date?: string;
  from?: string; to?: string;
}
export function fetchAuditLog(filters: AuditFilters = {}) {
  const params = new URLSearchParams();
  if (filters.limit) params.set('limit', String(filters.limit));
  if (filters.offset) params.set('offset', String(filters.offset));
  if (filters.action) params.set('action', filters.action);
  if (filters.userId) params.set('userId', filters.userId);
  if (filters.entityType) params.set('entityType', filters.entityType);
  if (filters.role) params.set('role', filters.role);
  if (filters.date) params.set('date', filters.date);
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  return request<{ logs: AuditEntry[]; total: number }>(`/api/audit?${params.toString()}`);
}

// ─── Admin CRUD ──────────────────────────────────────────────────────────

// Categories
export function createCategory(data: { name: string; color: string; kdsStation?: string; sortOrder?: number }) {
  return request<Category>('/api/admin/categories', { method: 'POST', body: JSON.stringify(data) });
}
export function updateCategory(id: string, data: Partial<{ name: string; color: string; kdsStation: string; sortOrder: number }>) {
  return request<Category>(`/api/admin/categories/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}
export function deleteCategory(id: string) {
  return request<{ ok: boolean }>(`/api/admin/categories/${id}`, { method: 'DELETE' });
}

// Products
export function createProduct(data: { name: string; shortName?: string; price: number; categoryId: string; modifierGroupIds?: string[] }) {
  return request<Product>('/api/admin/products', { method: 'POST', body: JSON.stringify(data) });
}
export function updateProduct(id: string, data: Partial<{ name: string; shortName: string; price: number; categoryId: string; modifierGroupIds: string[] }>) {
  return request<Product>(`/api/admin/products/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}
export function deleteProduct(id: string) {
  return request<{ ok: boolean }>(`/api/admin/products/${id}`, { method: 'DELETE' });
}

// Recipes
export function fetchProductRecipe(productId: string) {
  return request<Array<{ id: number; inventory_item_id: string; quantity: number; item_name: string; unit: string }>>(`/api/admin/products/${productId}/recipe`);
}
export function updateProductRecipe(productId: string, recipe: Array<{ inventoryItemId: string; quantity: number }>) {
  return request<RecipeLine[]>(`/api/admin/products/${productId}/recipe`, { method: 'PUT', body: JSON.stringify({ recipe }) });
}

// Recipe Cost Card
export interface RecipeCostLine {
  inventoryItemId: string; itemName: string; unit: string;
  quantity: number; costPerUnit: number; lineCost: number;
}
export interface RecipeCostCard {
  lines: RecipeCostLine[]; totalCost: number; price: number; margin: number; grossProfit: number;
}
export function fetchRecipeCost(productId: string) {
  return request<RecipeCostCard>(`/api/admin/products/${productId}/recipe-cost`);
}

// Modifier groups
export function createModifierGroup(data: { name: string; selectionType?: string; isRequired?: boolean; minSelections?: number; maxSelections?: number }) {
  return request<ModifierGroup>('/api/admin/modifier-groups', { method: 'POST', body: JSON.stringify(data) });
}
export function updateModifierGroup(id: string, data: Partial<{ name: string; selectionType: string; isRequired: boolean }>) {
  return request<{ ok: boolean }>(`/api/admin/modifier-groups/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}
export function deleteModifierGroup(id: string) {
  return request<{ ok: boolean }>(`/api/admin/modifier-groups/${id}`, { method: 'DELETE' });
}

// Modifiers
export function createModifier(data: { groupId: string; name: string; shortName?: string; priceAdjustment?: number; isDefault?: boolean }) {
  return request<Modifier>('/api/admin/modifiers', { method: 'POST', body: JSON.stringify(data) });
}
export function updateModifier(id: string, data: Partial<{ name: string; shortName: string; priceAdjustment: number; isDefault: boolean }>) {
  return request<{ ok: boolean }>(`/api/admin/modifiers/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}
export function deleteModifier(id: string) {
  return request<{ ok: boolean }>(`/api/admin/modifiers/${id}`, { method: 'DELETE' });
}

// Inventory items
export function createInventoryItem(data: { name: string; unit: string; isPerishable?: boolean; minimumStock?: number }) {
  return request<{ id: string }>('/api/admin/inventory-items', { method: 'POST', body: JSON.stringify(data) });
}
export function updateInventoryItem(id: string, data: Partial<{ name: string; unit: string; isPerishable: boolean; minimumStock: number }>) {
  return request<{ ok: boolean }>(`/api/admin/inventory-items/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}
export function deleteInventoryItem(id: string) {
  return request<{ ok: boolean }>(`/api/admin/inventory-items/${id}`, { method: 'DELETE' });
}

// Users
export function fetchUsers() {
  return request<Array<{ id: string; name: string; role: string; operator_type?: string | null; is_active: number; created_at: string }>>('/api/admin/users');
}
export function createUser(data: { name: string; pin: string; role: string; operatorType?: string }) {
  return request<{ id: string; name: string; role: string; operator_type?: string }>('/api/admin/users', { method: 'POST', body: JSON.stringify(data) });
}
export function updateUser(id: string, data: Partial<{ name: string; pin: string; role: string; operatorType: string; isActive: boolean }>) {
  return request<{ id: string; name: string; role: string; operator_type?: string }>(`/api/admin/users/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}
