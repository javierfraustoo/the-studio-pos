// ═══════════════════════════════════════════════════════════════════════════
// THE STUDIO POS — Supabase Client (replaces db.js)
// ═══════════════════════════════════════════════════════════════════════════

const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY environment variables');
}

const supabase = createClient(SUPABASE_URL || '', SUPABASE_SERVICE_KEY || '', {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ─── PIN hashing ──────────────────────────────────────────────────────────

function hashPin(pin) {
  return crypto.createHash('sha256').update(pin.toString()).digest('hex');
}

// ─── FIFO Deduction (calls PostgreSQL RPC) ────────────────────────────────

async function deductFifo(inventoryItemId, quantity, movementType, referenceId) {
  const { data, error } = await supabase.rpc('deduct_fifo', {
    p_inventory_item_id: inventoryItemId,
    p_quantity: quantity,
    p_movement_type: movementType,
    p_reference_id: referenceId,
  });
  if (error) throw new Error(`FIFO deduction error: ${error.message}`);
  return data || { totalCost: 0, shortfall: quantity };
}

// ─── Recipe Resolution ────────────────────────────────────────────────────

async function resolveRecipe(productId, modifierIds) {
  const { data: baseRecipe, error } = await supabase
    .from('recipes')
    .select('inventory_item_id, quantity')
    .eq('product_id', productId);

  if (error) throw new Error(`Recipe fetch error: ${error.message}`);

  const materials = new Map();
  for (const r of (baseRecipe || [])) {
    materials.set(r.inventory_item_id, (materials.get(r.inventory_item_id) || 0) + r.quantity);
  }

  if (modifierIds && modifierIds.length > 0) {
    const { data: adjustments, error: adjErr } = await supabase
      .from('modifier_recipe_adjustments')
      .select('inventory_item_id, quantity, replaces_inventory_item_id')
      .in('modifier_id', modifierIds);

    if (adjErr) throw new Error(`Modifier adjustment error: ${adjErr.message}`);

    for (const adj of (adjustments || [])) {
      if (adj.replaces_inventory_item_id && materials.has(adj.replaces_inventory_item_id)) {
        materials.delete(adj.replaces_inventory_item_id);
      }
      materials.set(adj.inventory_item_id, (materials.get(adj.inventory_item_id) || 0) + adj.quantity);
    }
  }

  return materials;
}

// ─── Audit Logger ─────────────────────────────────────────────────────────

async function logAudit(userId, userName, action, entityType, entityId, details) {
  try {
    await supabase.from('audit_log').insert({
      user_id: userId || null,
      user_name: userName || null,
      action,
      entity_type: entityType || null,
      entity_id: entityId || null,
      details: details || null,
    });
  } catch (e) {
    console.error('Audit log error:', e.message);
  }
}

// ─── Seed Data ────────────────────────────────────────────────────────────

async function seedIfEmpty() {
  const { data: cats } = await supabase.from('categories').select('id').limit(1);
  if (cats && cats.length > 0) return false;

  console.log('Seeding database...');

  // Users
  await supabase.from('users').insert([
    { id: 'user-admin', name: 'Administrador', pin_hash: hashPin('123456'), role: 'admin', operator_type: null },
    { id: 'user-supervisor', name: 'Supervisor', pin_hash: hashPin('654321'), role: 'supervisor', operator_type: null },
    { id: 'user-cajero1', name: 'Cajero 1', pin_hash: hashPin('111111'), role: 'operador', operator_type: 'cajero' },
    { id: 'user-cajero2', name: 'Cajero 2', pin_hash: hashPin('222222'), role: 'operador', operator_type: 'cajero' },
    { id: 'user-cubreturno', name: 'Cubreturno', pin_hash: hashPin('333333'), role: 'operador', operator_type: 'cajero' },
    { id: 'user-barista1', name: 'Barista 1', pin_hash: hashPin('444444'), role: 'operador', operator_type: 'barista' },
    { id: 'user-cocina1', name: 'Cocina 1', pin_hash: hashPin('555555'), role: 'operador', operator_type: 'cocina' },
  ]);

  // Categories
  await supabase.from('categories').insert([
    { id: 'cat-espresso', name: 'Espresso', color: '#78350F', icon: 'coffee', kds_station: 'bar', sort_order: 0 },
    { id: 'cat-filter', name: 'Filtrado', color: '#92400E', icon: 'filter', kds_station: 'bar', sort_order: 1 },
    { id: 'cat-cold', name: 'Frias', color: '#1E40AF', icon: 'snowflake', kds_station: 'bar', sort_order: 2 },
    { id: 'cat-food', name: 'Alimentos', color: '#065F46', icon: 'croissant', kds_station: 'kitchen', sort_order: 3 },
    { id: 'cat-retail', name: 'Retail', color: '#6B21A8', icon: 'bag', kds_station: 'none', sort_order: 4 },
    { id: 'cat-cold-food', name: 'Barra Fr\u00eda', color: '#0891B2', icon: 'ice', kds_station: 'none', sort_order: 5 },
  ]);

  // Modifier Groups
  await supabase.from('modifier_groups').insert([
    { id: 'mg-milk', name: 'Tipo de Leche', selection_type: 'single', is_required: true, min_selections: 1, max_selections: 1 },
    { id: 'mg-temp', name: 'Temperatura', selection_type: 'single', is_required: false, min_selections: 0, max_selections: 1 },
    { id: 'mg-shots', name: 'Shots Extra', selection_type: 'multiple', is_required: false, min_selections: 0, max_selections: 3 },
    { id: 'mg-syrup', name: 'Jarabe', selection_type: 'multiple', is_required: false, min_selections: 0, max_selections: 3 },
    { id: 'mg-size', name: 'Tamano', selection_type: 'single', is_required: true, min_selections: 1, max_selections: 1 },
    { id: 'mg-filter-method', name: 'Metodo', selection_type: 'single', is_required: true, min_selections: 1, max_selections: 1 },
    { id: 'mg-ice', name: 'HIELO', selection_type: 'multiple', is_required: false, min_selections: 1, max_selections: 3 },
  ]);

  // Modifiers
  await supabase.from('modifiers').insert([
    { id: 'mod-whole', group_id: 'mg-milk', name: 'Leche Entera', short_name: 'ENTERA', price_adjustment: 0, is_default: true },
    { id: 'mod-oat', group_id: 'mg-milk', name: 'Leche de Avena', short_name: 'AVENA', price_adjustment: 15, is_default: false },
    { id: 'mod-almond', group_id: 'mg-milk', name: 'Leche de Almendra', short_name: 'ALMND', price_adjustment: 15, is_default: false },
    { id: 'mod-coconut', group_id: 'mg-milk', name: 'Leche de Coco', short_name: 'COCO', price_adjustment: 15, is_default: false },
    { id: 'mod-skim', group_id: 'mg-milk', name: 'Leche Descremada', short_name: 'DESCR', price_adjustment: 0, is_default: false },
    { id: 'mod-normal-temp', group_id: 'mg-temp', name: 'Normal', short_name: 'NORM', price_adjustment: 0, is_default: true },
    { id: 'mod-extra-hot', group_id: 'mg-temp', name: 'Extra Caliente', short_name: 'XHOT', price_adjustment: 0, is_default: false },
    { id: 'mod-warm', group_id: 'mg-temp', name: 'Tibio', short_name: 'TIBIO', price_adjustment: 0, is_default: false },
    { id: 'mod-extra-shot', group_id: 'mg-shots', name: 'Shot Extra', short_name: '+SHOT', price_adjustment: 12, is_default: false },
    { id: 'mod-decaf-shot', group_id: 'mg-shots', name: 'Shot Descaf', short_name: 'DECAF', price_adjustment: 12, is_default: false },
    { id: 'mod-vanilla', group_id: 'mg-syrup', name: 'Vainilla', short_name: 'VAIN', price_adjustment: 10, is_default: false },
    { id: 'mod-caramel', group_id: 'mg-syrup', name: 'Caramelo', short_name: 'CARAM', price_adjustment: 10, is_default: false },
    { id: 'mod-hazelnut', group_id: 'mg-syrup', name: 'Avellana', short_name: 'AVELL', price_adjustment: 10, is_default: false },
    { id: 'mod-mocha', group_id: 'mg-syrup', name: 'Mocha', short_name: 'MOCHA', price_adjustment: 10, is_default: false },
    { id: 'mod-8oz', group_id: 'mg-size', name: '8 oz', short_name: '8oz', price_adjustment: 0, is_default: true },
    { id: 'mod-12oz', group_id: 'mg-size', name: '12 oz', short_name: '12oz', price_adjustment: 15, is_default: false },
    { id: 'mod-16oz', group_id: 'mg-size', name: '16 oz', short_name: '16oz', price_adjustment: 25, is_default: false },
    { id: 'mod-v60', group_id: 'mg-filter-method', name: 'V60', short_name: 'V60', price_adjustment: 0, is_default: true },
    { id: 'mod-chemex', group_id: 'mg-filter-method', name: 'Chemex', short_name: 'CHMX', price_adjustment: 10, is_default: false },
    { id: 'mod-aeropress', group_id: 'mg-filter-method', name: 'AeroPress', short_name: 'AERO', price_adjustment: 0, is_default: false },
  ]);

  // Modifier Recipe Adjustments
  await supabase.from('modifier_recipe_adjustments').insert([
    { modifier_id: 'mod-oat', inventory_item_id: 'inv-oat-milk', quantity: 250, replaces_inventory_item_id: 'inv-whole-milk' },
    { modifier_id: 'mod-almond', inventory_item_id: 'inv-almond-milk', quantity: 250, replaces_inventory_item_id: 'inv-whole-milk' },
    { modifier_id: 'mod-coconut', inventory_item_id: 'inv-coconut-milk', quantity: 250, replaces_inventory_item_id: 'inv-whole-milk' },
    { modifier_id: 'mod-skim', inventory_item_id: 'inv-skim-milk', quantity: 250, replaces_inventory_item_id: 'inv-whole-milk' },
    { modifier_id: 'mod-extra-shot', inventory_item_id: 'inv-coffee-beans', quantity: 18, replaces_inventory_item_id: null },
    { modifier_id: 'mod-decaf-shot', inventory_item_id: 'inv-coffee-beans', quantity: 18, replaces_inventory_item_id: null },
    { modifier_id: 'mod-vanilla', inventory_item_id: 'inv-vanilla-syrup', quantity: 15, replaces_inventory_item_id: null },
    { modifier_id: 'mod-caramel', inventory_item_id: 'inv-caramel-syrup', quantity: 15, replaces_inventory_item_id: null },
    { modifier_id: 'mod-hazelnut', inventory_item_id: 'inv-hazelnut-syrup', quantity: 15, replaces_inventory_item_id: null },
    { modifier_id: 'mod-mocha', inventory_item_id: 'inv-mocha-syrup', quantity: 15, replaces_inventory_item_id: null },
    { modifier_id: 'mod-12oz', inventory_item_id: 'inv-cup-12oz', quantity: 1, replaces_inventory_item_id: 'inv-cup-8oz' },
    { modifier_id: 'mod-16oz', inventory_item_id: 'inv-cup-16oz', quantity: 1, replaces_inventory_item_id: 'inv-cup-8oz' },
  ]);

  // Products
  const products = [
    { id: 'prod-espresso', category_id: 'cat-espresso', name: 'Espresso', short_name: 'ESPRES', price: 45, modifier_group_ids: ['mg-shots'] },
    { id: 'prod-americano', category_id: 'cat-espresso', name: 'Americano', short_name: 'AMRCNO', price: 55, modifier_group_ids: ['mg-size','mg-shots','mg-temp'] },
    { id: 'prod-latte', category_id: 'cat-espresso', name: 'Latte', short_name: 'LATTE', price: 70, modifier_group_ids: ['mg-size','mg-milk','mg-shots','mg-temp','mg-syrup'] },
    { id: 'prod-cappuccino', category_id: 'cat-espresso', name: 'Cappuccino', short_name: 'CAPPUC', price: 70, modifier_group_ids: ['mg-size','mg-milk','mg-shots','mg-temp'] },
    { id: 'prod-flatwhite', category_id: 'cat-espresso', name: 'Flat White', short_name: 'FLTWHT', price: 75, modifier_group_ids: ['mg-milk','mg-shots','mg-temp'] },
    { id: 'prod-mocha', category_id: 'cat-espresso', name: 'Mocha', short_name: 'MOCHA', price: 80, modifier_group_ids: ['mg-size','mg-milk','mg-shots','mg-temp'] },
    { id: 'prod-v60', category_id: 'cat-filter', name: 'Cafe Filtrado', short_name: 'FILTRO', price: 65, modifier_group_ids: ['mg-filter-method'] },
    { id: 'prod-matcha', category_id: 'cat-espresso', name: 'Matcha Latte', short_name: 'MATCHA', price: 85, modifier_group_ids: ['mg-size','mg-milk'] },
    { id: 'prod-iced-latte', category_id: 'cat-cold', name: 'Iced Latte', short_name: 'ICLTTE', price: 80, modifier_group_ids: ['mg-milk','mg-shots','mg-syrup'] },
    { id: 'prod-cold-brew', category_id: 'cat-cold', name: 'Cold Brew', short_name: 'CLDBW', price: 75, modifier_group_ids: ['mg-milk','mg-syrup'] },
    { id: 'prod-croissant', category_id: 'cat-food', name: 'Croissant', short_name: 'CRSNT', price: 55, modifier_group_ids: [] },
    { id: 'prod-cookie', category_id: 'cat-food', name: 'Cookie Chocochip', short_name: 'COOKIE', price: 45, modifier_group_ids: [] },
    { id: 'prod-sandwich', category_id: 'cat-food', name: 'Sandwich Jamon', short_name: 'SANDW', price: 85, modifier_group_ids: [] },
    { id: 'prod-bag-340', category_id: 'cat-retail', name: 'Cafe en Grano 340g', short_name: 'BAG340', price: 350, modifier_group_ids: [] },
    { id: 'prod-cafe-olla', category_id: 'cat-filter', name: 'Caf\u00e9 de Olla', short_name: 'OLLA', price: 50, modifier_group_ids: [] },
  ];
  await supabase.from('products').insert(products);

  // Recipes
  const recipes = [
    ['prod-espresso', 'inv-coffee-beans', 18], ['prod-espresso', 'inv-cup-8oz', 1],
    ['prod-americano', 'inv-coffee-beans', 18], ['prod-americano', 'inv-cup-8oz', 1], ['prod-americano', 'inv-lid', 1],
    ['prod-latte', 'inv-coffee-beans', 18], ['prod-latte', 'inv-whole-milk', 250], ['prod-latte', 'inv-cup-8oz', 1], ['prod-latte', 'inv-lid', 1],
    ['prod-cappuccino', 'inv-coffee-beans', 18], ['prod-cappuccino', 'inv-whole-milk', 180], ['prod-cappuccino', 'inv-cup-8oz', 1], ['prod-cappuccino', 'inv-lid', 1],
    ['prod-flatwhite', 'inv-coffee-beans', 36], ['prod-flatwhite', 'inv-whole-milk', 150], ['prod-flatwhite', 'inv-cup-8oz', 1], ['prod-flatwhite', 'inv-lid', 1],
    ['prod-mocha', 'inv-coffee-beans', 18], ['prod-mocha', 'inv-whole-milk', 200], ['prod-mocha', 'inv-mocha-syrup', 30], ['prod-mocha', 'inv-cup-8oz', 1], ['prod-mocha', 'inv-lid', 1],
    ['prod-v60', 'inv-coffee-beans', 20], ['prod-v60', 'inv-filter-paper', 1], ['prod-v60', 'inv-cup-12oz', 1], ['prod-v60', 'inv-lid', 1],
    ['prod-iced-latte', 'inv-coffee-beans', 18], ['prod-iced-latte', 'inv-whole-milk', 250], ['prod-iced-latte', 'inv-ice', 200], ['prod-iced-latte', 'inv-cold-cup-16oz', 1], ['prod-iced-latte', 'inv-cold-lid', 1],
    ['prod-cold-brew', 'inv-coffee-beans', 30], ['prod-cold-brew', 'inv-ice', 200], ['prod-cold-brew', 'inv-cold-cup-16oz', 1], ['prod-cold-brew', 'inv-cold-lid', 1],
    ['prod-croissant', 'inv-croissant', 1],
    ['prod-cookie', 'inv-cookie', 1],
    ['prod-sandwich', 'inv-sandwich-bread', 2], ['prod-sandwich', 'inv-ham', 80], ['prod-sandwich', 'inv-cheese', 40],
    ['prod-bag-340', 'inv-coffee-bag-340g', 1],
  ];
  await supabase.from('recipes').insert(recipes.map(([product_id, inventory_item_id, quantity]) => ({ product_id, inventory_item_id, quantity })));

  // Inventory Items
  const invItems = [
    { id: 'inv-coffee-beans', name: 'Cafe en grano (blend house)', unit: 'g', is_perishable: true, minimum_stock: 1000 },
    { id: 'inv-whole-milk', name: 'Leche entera', unit: 'ml', is_perishable: true, minimum_stock: 2000 },
    { id: 'inv-oat-milk', name: 'Leche de avena', unit: 'ml', is_perishable: true, minimum_stock: 1000 },
    { id: 'inv-almond-milk', name: 'Leche de almendra', unit: 'ml', is_perishable: true, minimum_stock: 1000 },
    { id: 'inv-coconut-milk', name: 'Leche de coco', unit: 'ml', is_perishable: true, minimum_stock: 500 },
    { id: 'inv-skim-milk', name: 'Leche descremada', unit: 'ml', is_perishable: true, minimum_stock: 1000 },
    { id: 'inv-cup-8oz', name: 'Vaso 8oz', unit: 'pz', is_perishable: false, minimum_stock: 50 },
    { id: 'inv-cup-12oz', name: 'Vaso 12oz', unit: 'pz', is_perishable: false, minimum_stock: 50 },
    { id: 'inv-cup-16oz', name: 'Vaso 16oz', unit: 'pz', is_perishable: false, minimum_stock: 50 },
    { id: 'inv-lid', name: 'Tapa caliente', unit: 'pz', is_perishable: false, minimum_stock: 100 },
    { id: 'inv-vanilla-syrup', name: 'Jarabe vainilla', unit: 'ml', is_perishable: false, minimum_stock: 200 },
    { id: 'inv-caramel-syrup', name: 'Jarabe caramelo', unit: 'ml', is_perishable: false, minimum_stock: 200 },
    { id: 'inv-hazelnut-syrup', name: 'Jarabe avellana', unit: 'ml', is_perishable: false, minimum_stock: 200 },
    { id: 'inv-mocha-syrup', name: 'Jarabe mocha', unit: 'ml', is_perishable: false, minimum_stock: 200 },
    { id: 'inv-croissant', name: 'Croissant', unit: 'pz', is_perishable: true, minimum_stock: 5 },
    { id: 'inv-cookie', name: 'Cookie chocochip', unit: 'pz', is_perishable: true, minimum_stock: 5 },
    { id: 'inv-sandwich-bread', name: 'Pan sandwich', unit: 'pz', is_perishable: true, minimum_stock: 10 },
    { id: 'inv-ham', name: 'Jamon', unit: 'g', is_perishable: true, minimum_stock: 200 },
    { id: 'inv-cheese', name: 'Queso', unit: 'g', is_perishable: true, minimum_stock: 200 },
    { id: 'inv-filter-paper', name: 'Filtro de papel', unit: 'pz', is_perishable: false, minimum_stock: 30 },
    { id: 'inv-ice', name: 'Hielo', unit: 'g', is_perishable: false, minimum_stock: 5000 },
    { id: 'inv-cold-cup-16oz', name: 'Vaso frio 16oz', unit: 'pz', is_perishable: false, minimum_stock: 50 },
    { id: 'inv-cold-lid', name: 'Tapa fria', unit: 'pz', is_perishable: false, minimum_stock: 50 },
    { id: 'inv-coffee-bag-340g', name: 'Bolsa cafe 340g', unit: 'pz', is_perishable: true, minimum_stock: 5 },
  ];
  await supabase.from('inventory_items').insert(invItems);

  // Initial Batches
  const now = new Date();
  const daysAgo = (n) => new Date(now.getTime() - n * 86400000).toISOString();
  const daysFromNow = (n) => new Date(now.getTime() + n * 86400000).toISOString();

  const batches = [
    { inventory_item_id: 'inv-coffee-beans', quantity_received: 5000, quantity_remaining: 5000, cost_per_unit: 0.18, received_at: daysAgo(7), expires_at: daysFromNow(60) },
    { inventory_item_id: 'inv-coffee-beans', quantity_received: 5000, quantity_remaining: 5000, cost_per_unit: 0.20, received_at: daysAgo(2), expires_at: daysFromNow(75) },
    { inventory_item_id: 'inv-whole-milk', quantity_received: 6000, quantity_remaining: 6000, cost_per_unit: 0.025, received_at: daysAgo(3), expires_at: daysFromNow(5) },
    { inventory_item_id: 'inv-whole-milk', quantity_received: 6000, quantity_remaining: 6000, cost_per_unit: 0.025, received_at: daysAgo(1), expires_at: daysFromNow(7) },
    { inventory_item_id: 'inv-oat-milk', quantity_received: 3000, quantity_remaining: 3000, cost_per_unit: 0.055, received_at: daysAgo(4), expires_at: daysFromNow(30) },
    { inventory_item_id: 'inv-almond-milk', quantity_received: 2000, quantity_remaining: 2000, cost_per_unit: 0.06, received_at: daysAgo(3), expires_at: daysFromNow(30) },
    { inventory_item_id: 'inv-coconut-milk', quantity_received: 1000, quantity_remaining: 1000, cost_per_unit: 0.07, received_at: daysAgo(5), expires_at: daysFromNow(30) },
    { inventory_item_id: 'inv-skim-milk', quantity_received: 3000, quantity_remaining: 3000, cost_per_unit: 0.022, received_at: daysAgo(2), expires_at: daysFromNow(5) },
    { inventory_item_id: 'inv-cup-8oz', quantity_received: 200, quantity_remaining: 200, cost_per_unit: 1.5, received_at: daysAgo(10), expires_at: null },
    { inventory_item_id: 'inv-cup-12oz', quantity_received: 200, quantity_remaining: 200, cost_per_unit: 1.8, received_at: daysAgo(10), expires_at: null },
    { inventory_item_id: 'inv-cup-16oz', quantity_received: 200, quantity_remaining: 200, cost_per_unit: 2.2, received_at: daysAgo(10), expires_at: null },
    { inventory_item_id: 'inv-lid', quantity_received: 500, quantity_remaining: 500, cost_per_unit: 0.5, received_at: daysAgo(10), expires_at: null },
    { inventory_item_id: 'inv-vanilla-syrup', quantity_received: 750, quantity_remaining: 750, cost_per_unit: 0.12, received_at: daysAgo(15), expires_at: null },
    { inventory_item_id: 'inv-caramel-syrup', quantity_received: 750, quantity_remaining: 750, cost_per_unit: 0.12, received_at: daysAgo(15), expires_at: null },
    { inventory_item_id: 'inv-hazelnut-syrup', quantity_received: 750, quantity_remaining: 750, cost_per_unit: 0.13, received_at: daysAgo(15), expires_at: null },
    { inventory_item_id: 'inv-mocha-syrup', quantity_received: 750, quantity_remaining: 750, cost_per_unit: 0.11, received_at: daysAgo(15), expires_at: null },
    { inventory_item_id: 'inv-croissant', quantity_received: 15, quantity_remaining: 15, cost_per_unit: 18, received_at: daysAgo(1), expires_at: daysFromNow(2) },
    { inventory_item_id: 'inv-cookie', quantity_received: 20, quantity_remaining: 20, cost_per_unit: 12, received_at: daysAgo(1), expires_at: daysFromNow(4) },
    { inventory_item_id: 'inv-sandwich-bread', quantity_received: 30, quantity_remaining: 30, cost_per_unit: 5, received_at: daysAgo(1), expires_at: daysFromNow(3) },
    { inventory_item_id: 'inv-ham', quantity_received: 1000, quantity_remaining: 1000, cost_per_unit: 0.08, received_at: daysAgo(2), expires_at: daysFromNow(5) },
    { inventory_item_id: 'inv-cheese', quantity_received: 800, quantity_remaining: 800, cost_per_unit: 0.12, received_at: daysAgo(2), expires_at: daysFromNow(7) },
    { inventory_item_id: 'inv-filter-paper', quantity_received: 100, quantity_remaining: 100, cost_per_unit: 1.2, received_at: daysAgo(20), expires_at: null },
    { inventory_item_id: 'inv-ice', quantity_received: 20000, quantity_remaining: 20000, cost_per_unit: 0.002, received_at: daysAgo(0), expires_at: null },
    { inventory_item_id: 'inv-cold-cup-16oz', quantity_received: 200, quantity_remaining: 200, cost_per_unit: 2.5, received_at: daysAgo(10), expires_at: null },
    { inventory_item_id: 'inv-cold-lid', quantity_received: 200, quantity_remaining: 200, cost_per_unit: 0.6, received_at: daysAgo(10), expires_at: null },
    { inventory_item_id: 'inv-coffee-bag-340g', quantity_received: 15, quantity_remaining: 15, cost_per_unit: 150, received_at: daysAgo(3), expires_at: daysFromNow(90) },
  ];
  await supabase.from('inventory_batches').insert(batches);

  await logAudit('system', 'System', 'database_seeded', null, null, { message: 'Initial seed data created' });

  console.log('Database seeded successfully!');
  console.log('  Default Users:');
  console.log('    Admin:       PIN 123456');
  console.log('    Supervisor:  PIN 654321');
  console.log('    Cajero 1:    PIN 111111');
  console.log('    Cajero 2:    PIN 222222');
  console.log('    Cubreturno:  PIN 333333');
  console.log('    Barista 1:   PIN 444444');
  console.log('    Cocina 1:    PIN 555555');
  return true;
}

module.exports = { supabase, hashPin, deductFifo, resolveRecipe, logAudit, seedIfEmpty };
