require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const { v4: uuid } = require('uuid');
const { supabase, deductFifo, resolveRecipe, logAudit, hashPin, seedIfEmpty } = require('./supabase');
const { createToken, authMiddleware, requireRole } = require('./middleware/auth');

const PORT = process.env.PORT || 3001;
const app = express();

app.use(cors());
app.use(express.json());

// Serve frontend static files in production
const FRONTEND_DIST = path.join(__dirname, '..', '..', 'frontend', 'dist');
if (fs.existsSync(FRONTEND_DIST)) {
  app.use(express.static(FRONTEND_DIST));
}

// Health check (no auth)
app.get('/health', (_req, res) => res.json({ status: 'ok', version: '4.0.0-supabase' }));

// Auth middleware for all /api routes
app.use('/api', authMiddleware);

// ═══════════════════════════════════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════════════════════════════════

app.get('/api/auth/users-list', async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, name, role, operator_type')
      .eq('is_active', true)
      .order('name');
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { userId, pin } = req.body;
  if (!userId || !pin) return res.status(400).json({ error: 'Missing userId or pin' });

  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('id, name, role, operator_type, pin_hash, is_active')
      .eq('id', userId)
      .single();

    if (error || !user || !user.is_active) {
      return res.status(401).json({ error: 'User not found' });
    }

    if (user.pin_hash !== hashPin(pin)) {
      await logAudit(userId, user.name, 'login_failed', 'user', userId, { reason: 'wrong_pin' });
      return res.status(401).json({ error: 'PIN incorrecto' });
    }

    const token = createToken({ userId: user.id, role: user.role });
    await logAudit(user.id, user.name, 'login', 'user', user.id, null);
    res.json({ token, user: { id: user.id, name: user.name, role: user.role, operator_type: user.operator_type } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/auth/me', (req, res) => {
  res.json(req.user);
});

// ═══════════════════════════════════════════════════════════════════════════
// MANAGER OVERRIDE — Verify PIN for restricted actions
// ═══════════════════════════════════════════════════════════════════════════

app.post('/api/auth/verify-override', async (req, res) => {
  const { pin, action, details } = req.body;
  if (!pin) return res.status(400).json({ error: 'PIN required' });

  try {
    const pinHash = hashPin(pin);
    const { data: overrideUser, error } = await supabase
      .from('users')
      .select('id, name, role')
      .in('role', ['admin', 'supervisor'])
      .eq('pin_hash', pinHash)
      .eq('is_active', true)
      .limit(1)
      .single();

    if (error || !overrideUser) {
      await logAudit(req.user?.id, req.user?.name, 'override_denied', 'override', null, { action, details, reason: 'invalid_pin' });
      return res.json({ authorized: false });
    }

    await logAudit(overrideUser.id, overrideUser.name, 'override_authorized', 'override', null, {
      action,
      details,
      requestedBy: req.user?.name,
      requestedById: req.user?.id,
    });

    res.json({ authorized: true, overrideUser: { id: overrideUser.id, name: overrideUser.name, role: overrideUser.role } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// MENU
// ═══════════════════════════════════════════════════════════════════════════

app.get('/api/menu', async (_req, res) => {
  try {
    const { data: categories } = await supabase
      .from('categories')
      .select('*')
      .is('deleted_at', null)
      .order('sort_order');

    const { data: rawProducts } = await supabase
      .from('products')
      .select('*')
      .is('deleted_at', null)
      .order('name');

    const { data: allRecipes } = await supabase.from('recipes').select('*');
    const { data: rawGroups } = await supabase.from('modifier_groups').select('*').is('deleted_at', null);
    const { data: rawModifiers } = await supabase.from('modifiers').select('*').is('deleted_at', null);
    const { data: rawAdjustments } = await supabase.from('modifier_recipe_adjustments').select('*');

    const products = (rawProducts || []).map(p => ({
      ...p,
      modifierGroupIds: p.modifier_group_ids || [],
      recipe: (allRecipes || []).filter(r => r.product_id === p.id).map(r => ({ inventory_item_id: r.inventory_item_id, quantity: r.quantity })),
    }));

    const modifierGroups = (rawGroups || []).map(g => ({
      ...g,
      isRequired: !!g.is_required,
      selectionType: g.selection_type,
      minSelections: g.min_selections,
      maxSelections: g.max_selections,
      modifiers: (rawModifiers || []).filter(m => m.group_id === g.id).map(m => ({
        ...m,
        priceAdjustment: parseFloat(m.price_adjustment) || 0,
        shortName: m.short_name,
        isDefault: !!m.is_default,
      })),
    }));

    const modifierRecipeAdjustments = (rawAdjustments || []).map(a => ({
      modifierId: a.modifier_id,
      inventoryItemId: a.inventory_item_id,
      quantity: a.quantity,
      replacesInventoryItemId: a.replaces_inventory_item_id,
    }));

    res.json({ categories, products, modifierGroups, modifierRecipeAdjustments });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// INVENTORY
// ═══════════════════════════════════════════════════════════════════════════

app.get('/api/inventory', async (_req, res) => {
  try {
    const { data: items } = await supabase.from('inventory_items').select('*').is('deleted_at', null);
    const { data: allBatches } = await supabase
      .from('inventory_batches')
      .select('*')
      .gt('quantity_remaining', 0)
      .order('received_at');

    const result = (items || []).map(item => {
      const batches = (allBatches || []).filter(b => b.inventory_item_id === item.id);
      const stock = batches.reduce((s, b) => s + parseFloat(b.quantity_remaining), 0);
      return { ...item, isPerishable: !!item.is_perishable, minimumStock: parseFloat(item.minimum_stock), stock, batches };
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/inventory/receive', async (req, res) => {
  const { inventoryItemId, quantity, costPerUnit, expiresAt } = req.body;
  if (!inventoryItemId || !quantity) return res.status(400).json({ error: 'Missing fields' });

  try {
    await supabase.from('inventory_batches').insert({
      inventory_item_id: inventoryItemId,
      quantity_received: quantity,
      quantity_remaining: quantity,
      cost_per_unit: costPerUnit || 0,
      expires_at: expiresAt || null,
    });

    await logAudit(req.user?.id, req.user?.name, 'inventory_received', 'inventory_item', inventoryItemId, { quantity, costPerUnit });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// ORDERS
// ═══════════════════════════════════════════════════════════════════════════

app.get('/api/orders', async (req, res) => {
  try {
    const date = req.query.date || (() => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`; })();
    const dayStart = `${date}T00:00:00-06:00`;
    const dayEnd = `${date}T23:59:59-06:00`;

    const { data: orders } = await supabase
      .from('orders')
      .select('*')
      .gte('created_at', dayStart)
      .lte('created_at', dayEnd)
      .order('created_at', { ascending: false });

    if (!orders || orders.length === 0) return res.json([]);

    const orderIds = orders.map(o => o.id);
    const { data: allItems } = await supabase.from('order_items').select('*').in('order_id', orderIds);
    const itemIds = (allItems || []).map(i => i.id);
    const { data: allMods } = itemIds.length > 0
      ? await supabase.from('order_item_modifiers').select('*').in('order_item_id', itemIds)
      : { data: [] };

    const result = orders.map(order => {
      const items = (allItems || []).filter(i => i.order_id === order.id).map(item => ({
        ...item,
        modifiers: (allMods || []).filter(m => m.order_item_id === item.id).map(m => ({
          id: m.modifier_id, name: m.modifier_name, shortName: m.short_name, priceAdjustment: parseFloat(m.price_adjustment),
        })),
      }));
      return { ...order, items };
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/orders/:id', async (req, res) => {
  try {
    const { data: order, error } = await supabase.from('orders').select('*').eq('id', req.params.id).single();
    if (error || !order) return res.status(404).json({ error: 'Order not found' });

    const { data: rawItems } = await supabase.from('order_items').select('*').eq('order_id', order.id);
    const itemIds = (rawItems || []).map(i => i.id);
    const { data: allMods } = itemIds.length > 0
      ? await supabase.from('order_item_modifiers').select('*').in('order_item_id', itemIds)
      : { data: [] };

    const items = (rawItems || []).map(item => ({
      ...item,
      modifiers: (allMods || []).filter(m => m.order_item_id === item.id).map(m => ({
        id: m.modifier_id, name: m.modifier_name, shortName: m.short_name, priceAdjustment: parseFloat(m.price_adjustment),
      })),
    }));

    const { data: deductions } = await supabase.rpc('get_order_deductions', { p_order_id: order.id }).catch(() => ({ data: [] }));

    res.json({ ...order, items, deductions: deductions || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/orders', async (req, res) => {
  const { items, paymentMethod, customerName, orderType, discount, discountAuthorizedBy } = req.body;
  if (!items || !items.length) return res.status(400).json({ error: 'No items' });

  try {
    const today = (() => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`; })();
    const dayStart = `${today}T00:00:00-06:00`;
    const dayEnd = `${today}T23:59:59-06:00`;

    const { data: maxRow } = await supabase
      .from('orders')
      .select('order_number')
      .gte('created_at', dayStart)
      .lte('created_at', dayEnd)
      .order('order_number', { ascending: false })
      .limit(1)
      .single();

    const orderNumber = (maxRow?.order_number || 0) + 1;

    let subtotal = 0;
    for (const item of items) subtotal += item.lineTotal;

    const discountAmount = parseFloat(discount) || 0;
    const total = subtotal - discountAmount;

    const orderId = uuid();
    const { error: orderErr } = await supabase.from('orders').insert({
      id: orderId,
      order_number: orderNumber,
      customer_name: customerName || '',
      order_type: orderType || 'dine_in',
      payment_method: paymentMethod,
      subtotal,
      total,
      discount: discountAmount,
      discount_authorized_by: discountAuthorizedBy || null,
      user_id: req.user?.id || null,
      user_name: req.user?.name || null,
    });
    if (orderErr) throw orderErr;

    let recipeCost = 0;
    const kdsItemsToInsert = [];

    for (const item of items) {
      const { data: oiData, error: oiErr } = await supabase.from('order_items').insert({
        order_id: orderId,
        product_id: item.productId,
        product_name: item.productName,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        modifiers_total: item.modifiersTotal || 0,
        line_total: item.lineTotal,
        notes: item.notes || '',
      }).select('id').single();
      if (oiErr) throw oiErr;

      const orderItemId = oiData.id;

      if (item.modifiers && item.modifiers.length > 0) {
        await supabase.from('order_item_modifiers').insert(
          item.modifiers.map(mod => ({
            order_item_id: orderItemId,
            modifier_id: mod.id,
            modifier_name: mod.name,
            short_name: mod.shortName || '',
            price_adjustment: mod.priceAdjustment || 0,
          }))
        );
      }

      // FIFO deduction
      const modifierIds = (item.modifiers || []).map(m => m.id);
      const materials = await resolveRecipe(item.productId, modifierIds);

      for (const [invItemId, qty] of materials) {
        const totalQty = qty * item.quantity;
        const result = await deductFifo(invItemId, totalQty, 'sale', orderId);
        recipeCost += (result.totalCost || 0);
      }

      // KDS routing
      const { data: product } = await supabase.from('products').select('category_id').eq('id', item.productId).single();
      const { data: category } = product
        ? await supabase.from('categories').select('kds_station').eq('id', product.category_id).single()
        : { data: null };
      const station = category?.kds_station || 'bar';

      if (station !== 'none') {
        const kdsId = uuid();
        kdsItemsToInsert.push({
          id: kdsId,
          order_id: orderId,
          order_item_id: orderItemId,
          order_number: orderNumber,
          customer_name: customerName || '',
          order_type: orderType || 'dine_in',
          product_name: item.productName,
          quantity: item.quantity,
          modifiers_json: (item.modifiers || []).map(m => m.shortName || m.name),
          notes: item.notes || '',
          station,
          status: 'pending',
        });
      }
    }

    // Insert KDS items
    if (kdsItemsToInsert.length > 0) {
      await supabase.from('kds_items').insert(kdsItemsToInsert);
    }

    // Fetch the created order with items
    const { data: order } = await supabase.from('orders').select('*').eq('id', orderId).single();
    const { data: orderItems } = await supabase.from('order_items').select('*').eq('order_id', orderId);
    const oiIds = (orderItems || []).map(oi => oi.id);
    const { data: orderMods } = oiIds.length > 0
      ? await supabase.from('order_item_modifiers').select('*').in('order_item_id', oiIds)
      : { data: [] };

    const formattedItems = (orderItems || []).map(oi => ({
      ...oi,
      modifiers: (orderMods || []).filter(m => m.order_item_id === oi.id).map(m => ({
        id: m.modifier_id, name: m.modifier_name, shortName: m.short_name, priceAdjustment: parseFloat(m.price_adjustment),
      })),
    }));

    const { data: kdsItems } = await supabase.from('kds_items').select('*').eq('order_id', orderId);
    const formattedKds = (kdsItems || []).map(k => ({ ...k, modifiers: k.modifiers_json }));

    await logAudit(req.user?.id, req.user?.name, 'order_created', 'order', orderId,
      { orderNumber, total, items: items.length, paymentMethod });

    // Broadcast via Supabase channel
    await supabase.channel('pos-events').send({
      type: 'broadcast',
      event: 'order:created',
      payload: { id: orderId, orderNumber },
    });

    res.json({ ...order, items: formattedItems, kdsItems: formattedKds, recipeCost });
  } catch (err) {
    console.error('Order creation error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Cancel order (requires override for processed orders)
app.patch('/api/orders/:id/cancel', async (req, res) => {
  try {
    const { data: order } = await supabase.from('orders').select('*').eq('id', req.params.id).single();
    if (!order) return res.status(404).json({ error: 'Order not found' });

    await supabase.from('orders').update({ status: 'cancelled' }).eq('id', req.params.id);
    await logAudit(req.user?.id, req.user?.name, 'order_cancelled', 'order', req.params.id, {
      orderNumber: order.order_number,
      total: order.total,
      authorizedBy: req.body.authorizedBy || null,
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// KDS
// ═══════════════════════════════════════════════════════════════════════════

app.get('/api/kds/:station', async (req, res) => {
  try {
    const { station } = req.params;
    const { data } = await supabase
      .from('kds_items')
      .select('*')
      .eq('station', station)
      .neq('status', 'delivered')
      .order('routed_at');

    res.json((data || []).map(k => ({ ...k, modifiers: k.modifiers_json })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/kds/:station/history', async (req, res) => {
  try {
    const { station } = req.params;
    const date = req.query.date || (() => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`; })();
    const dayStart = `${date}T00:00:00-06:00`;
    const dayEnd = `${date}T23:59:59-06:00`;

    const { data } = await supabase
      .from('kds_items')
      .select('*')
      .eq('station', station)
      .eq('status', 'delivered')
      .gte('delivered_at', dayStart)
      .lte('delivered_at', dayEnd)
      .order('delivered_at', { ascending: false })
      .limit(50);

    res.json((data || []).map(k => ({ ...k, modifiers: k.modifiers_json })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/kds/:itemId', async (req, res) => {
  try {
    const { itemId } = req.params;
    const { status } = req.body;

    if (!['pending', 'in_progress', 'ready', 'delivered'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const updateObj = { status };
    if (status === 'pending') {
      updateObj.ready_at = null;
      updateObj.delivered_at = null;
    } else if (status === 'ready') {
      updateObj.ready_at = new Date().toISOString();
      updateObj.delivered_at = null;
    } else if (status === 'delivered') {
      updateObj.delivered_at = new Date().toISOString();
      // Track who delivered (graceful if column doesn't exist yet)
      if (req.user?.name) updateObj.delivered_by = req.user.name;
    }

    await supabase.from('kds_items').update(updateObj).eq('id', itemId);

    const { data: item } = await supabase.from('kds_items').select('*').eq('id', itemId).single();
    if (item) {
      const updated = { ...item, modifiers: item.modifiers_json };

      // Check if all items for this order are delivered
      const { data: pendingItems } = await supabase
        .from('kds_items')
        .select('id')
        .eq('order_id', item.order_id)
        .neq('status', 'delivered');

      if (!pendingItems || pendingItems.length === 0) {
        await supabase.channel('pos-events').send({
          type: 'broadcast',
          event: 'kds:order-complete',
          payload: { orderId: item.order_id, orderNumber: item.order_number },
        });
      }

      res.json({ ok: true, item: updated });
    } else {
      res.json({ ok: true, item: null });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// WASTE
// ═══════════════════════════════════════════════════════════════════════════

app.get('/api/waste', async (req, res) => {
  try {
    const date = req.query.date || (() => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`; })();
    const dayStart = `${date}T00:00:00-06:00`;
    const dayEnd = `${date}T23:59:59-06:00`;

    const { data } = await supabase
      .from('waste_logs')
      .select('*')
      .gte('created_at', dayStart)
      .lte('created_at', dayEnd)
      .order('created_at', { ascending: false });

    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/waste', async (req, res) => {
  const { itemType, itemId, quantity, reason, notes } = req.body;
  if (!itemId || !quantity || !reason) return res.status(400).json({ error: 'Missing fields' });

  try {
    const wasteId = uuid();
    let totalCost = 0;
    let itemName = '';
    let unit = 'pz';

    if (itemType === 'supply') {
      const { data: inv } = await supabase.from('inventory_items').select('*').eq('id', itemId).single();
      if (!inv) throw new Error('Inventory item not found');
      itemName = inv.name;
      unit = inv.unit;
      const result = await deductFifo(itemId, quantity, 'waste', wasteId);
      totalCost = result.totalCost || 0;
    } else if (itemType === 'product') {
      const { data: prod } = await supabase.from('products').select('*').eq('id', itemId).single();
      if (!prod) throw new Error('Product not found');
      itemName = prod.name;
      const materials = await resolveRecipe(itemId, []);
      for (const [invItemId, qty] of materials) {
        const totalQty = qty * quantity;
        const result = await deductFifo(invItemId, totalQty, 'waste', wasteId);
        totalCost += (result.totalCost || 0);
      }
    }

    await supabase.from('waste_logs').insert({
      id: wasteId, item_type: itemType, item_id: itemId, item_name: itemName,
      quantity, unit, reason, notes: notes || '', total_cost: totalCost,
      user_id: req.user?.id || null, user_name: req.user?.name || null,
    });

    await logAudit(req.user?.id, req.user?.name, 'waste_registered', 'waste', wasteId,
      { itemType, itemName, quantity, reason, totalCost });

    const { data: wasteLog } = await supabase.from('waste_logs').select('*').eq('id', wasteId).single();

    await supabase.channel('pos-events').send({
      type: 'broadcast', event: 'waste:created', payload: wasteLog,
    });

    res.json(wasteLog);
  } catch (err) {
    console.error('Waste error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// ANALYTICS
// ═══════════════════════════════════════════════════════════════════════════

app.get('/api/analytics', async (req, res) => {
  try {
    // Use local date from client or server local time
    const now = new Date();
    const localDate = req.query.date || `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    const dayStart = `${localDate}T00:00:00-06:00`;
    const dayEnd = `${localDate}T23:59:59-06:00`;

    // Revenue
    const { data: ordersToday } = await supabase
      .from('orders')
      .select('total, created_at')
      .gte('created_at', dayStart)
      .lte('created_at', dayEnd);

    const revenue = (ordersToday || []).reduce((s, o) => s + parseFloat(o.total), 0);
    const orderCount = (ordersToday || []).length;
    const avgTicket = orderCount > 0 ? revenue / orderCount : 0;

    // Waste cost
    const { data: wasteToday } = await supabase
      .from('waste_logs')
      .select('total_cost')
      .gte('created_at', dayStart)
      .lte('created_at', dayEnd);
    const wasteCost = (wasteToday || []).reduce((s, w) => s + parseFloat(w.total_cost), 0);

    // Recipe cost (from inventory movements)
    const { data: movements } = await supabase
      .from('inventory_movements')
      .select('cost')
      .eq('movement_type', 'sale')
      .gte('created_at', dayStart)
      .lte('created_at', dayEnd);
    const recipeCost = (movements || []).reduce((s, m) => s + Math.abs(parseFloat(m.cost)), 0);

    // Top sellers
    const { data: orderItemsToday } = await supabase
      .from('order_items')
      .select('product_name, product_id, quantity, line_total, order_id');

    // Filter to today's orders
    const todayOrderIds = (ordersToday || []).map(o => o.id);
    // We need order IDs — let's get them
    const { data: todayOrders } = await supabase
      .from('orders')
      .select('id')
      .gte('created_at', dayStart)
      .lte('created_at', dayEnd);
    const todayIds = new Set((todayOrders || []).map(o => o.id));

    const filteredItems = (orderItemsToday || []).filter(oi => todayIds.has(oi.order_id));
    const sellerMap = {};
    for (const oi of filteredItems) {
      if (!sellerMap[oi.product_id]) sellerMap[oi.product_id] = { product_name: oi.product_name, product_id: oi.product_id, totalQty: 0, totalRevenue: 0 };
      sellerMap[oi.product_id].totalQty += oi.quantity;
      sellerMap[oi.product_id].totalRevenue += parseFloat(oi.line_total);
    }
    const topSellers = Object.values(sellerMap).sort((a, b) => b.totalQty - a.totalQty).slice(0, 10);

    // Profitability
    const { data: allProducts } = await supabase.from('products').select('id, name, price').is('deleted_at', null);
    const { data: allRecipes } = await supabase.from('recipes').select('*');
    const { data: allBatches } = await supabase.from('inventory_batches').select('inventory_item_id, cost_per_unit, quantity_remaining, received_at').gt('quantity_remaining', 0).order('received_at');

    const profitability = (allProducts || []).map(p => {
      const recipe = (allRecipes || []).filter(r => r.product_id === p.id);
      let recipeCostPer = 0;
      for (const r of recipe) {
        const batch = (allBatches || []).find(b => b.inventory_item_id === r.inventory_item_id);
        if (batch) recipeCostPer += r.quantity * parseFloat(batch.cost_per_unit);
      }
      const price = parseFloat(p.price);
      const margin = price > 0 ? ((price - recipeCostPer) / price * 100) : 0;
      return { id: p.id, name: p.name, price, recipeCost: recipeCostPer, margin: Math.round(margin * 10) / 10 };
    }).sort((a, b) => b.margin - a.margin);

    // Sales by hour
    const hourlyData = Array.from({ length: 24 }, (_, h) => ({ hour: h, revenue: 0, orders: 0 }));
    for (const o of (ordersToday || [])) {
      const hour = new Date(o.created_at).getHours();
      hourlyData[hour].revenue += parseFloat(o.total);
      hourlyData[hour].orders += 1;
    }

    const wastePercent = revenue > 0 ? (wasteCost / revenue * 100) : 0;
    const top5Profitable = profitability.filter(p => p.recipeCost > 0).slice(0, 5);

    res.json({ revenue, orderCount, avgTicket, wasteCost, recipeCost, topSellers, profitability, hourlyData, wastePercent: Math.round(wastePercent * 10) / 10, top5Profitable });
  } catch (err) {
    console.error('Analytics error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/analytics/orders', requireRole('admin', 'supervisor'), async (req, res) => {
  try {
    const now = new Date();
    const date = req.query.date || `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    const dayStart = `${date}T00:00:00-06:00`;
    const dayEnd = `${date}T23:59:59-06:00`;

    const { data: orders } = await supabase
      .from('orders')
      .select('*')
      .gte('created_at', dayStart)
      .lte('created_at', dayEnd)
      .order('created_at', { ascending: false });

    if (!orders || orders.length === 0) return res.json([]);

    const orderIds = orders.map(o => o.id);
    const { data: allItems } = await supabase.from('order_items').select('*').in('order_id', orderIds);
    const itemIds = (allItems || []).map(i => i.id);
    const { data: allMods } = itemIds.length > 0
      ? await supabase.from('order_item_modifiers').select('*').in('order_item_id', itemIds)
      : { data: [] };

    const { data: allMovements } = await supabase.from('inventory_movements').select('reference_id, cost').eq('movement_type', 'sale').in('reference_id', orderIds);
    const { data: allKds } = await supabase.from('kds_items').select('order_id, routed_at, delivered_at, status').in('order_id', orderIds);

    const result = orders.map(order => {
      const items = (allItems || []).filter(i => i.order_id === order.id).map(item => ({
        ...item,
        modifiers: (allMods || []).filter(m => m.order_item_id === item.id).map(m => ({
          id: m.modifier_id, name: m.modifier_name, shortName: m.short_name, priceAdjustment: parseFloat(m.price_adjustment),
        })),
      }));

      const orderMovements = (allMovements || []).filter(m => m.reference_id === order.id);
      const rcost = orderMovements.reduce((s, m) => s + Math.abs(parseFloat(m.cost)), 0);

      const orderKds = (allKds || []).filter(k => k.order_id === order.id && k.status === 'delivered');
      let prepTimeMinutes = null;
      if (orderKds.length > 0) {
        const starts = orderKds.map(k => new Date(k.routed_at).getTime());
        const ends = orderKds.map(k => new Date(k.delivered_at).getTime());
        prepTimeMinutes = Math.round((Math.max(...ends) - Math.min(...starts)) / 60000);
      }

      const total = parseFloat(order.total);
      const grossMargin = total > 0 ? ((total - rcost) / total * 100) : 0;

      return {
        id: order.id, order_number: order.order_number, customer_name: order.customer_name,
        order_type: order.order_type, payment_method: order.payment_method, total,
        subtotal: parseFloat(order.subtotal) || total,
        discount: parseFloat(order.discount) || 0,
        discount_authorized_by: order.discount_authorized_by || null,
        user_name: order.user_name || 'Sistema', created_at: order.created_at,
        items, recipeCost: rcost, prepTimeMinutes, grossMargin: Math.round(grossMargin * 10) / 10,
      };
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// AUDIT LOG
// ═══════════════════════════════════════════════════════════════════════════

app.get('/api/audit', requireRole('admin', 'supervisor'), async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const offset = parseInt(req.query.offset) || 0;
    const { action, userId, entityType, role, date, from, to } = req.query;

    let query = supabase.from('audit_log').select('*', { count: 'exact' });

    if (action) query = query.eq('action', action);
    if (userId) query = query.eq('user_id', userId);
    if (entityType) query = query.eq('entity_type', entityType);
    if (date) {
      query = query.gte('created_at', `${date}T00:00:00-06:00`).lte('created_at', `${date}T23:59:59-06:00`);
    }
    if (from) query = query.gte('created_at', from);
    if (to) query = query.lte('created_at', to);

    query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

    const { data: logs, count, error } = await query;
    if (error) throw error;

    // Filter by role if needed (join with users)
    let filteredLogs = logs || [];
    if (role) {
      const { data: roleUsers } = await supabase.from('users').select('id').eq('role', role);
      const roleUserIds = new Set((roleUsers || []).map(u => u.id));
      filteredLogs = filteredLogs.filter(l => roleUserIds.has(l.user_id));
    }

    res.json({ logs: filteredLogs, total: count || 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN: CATEGORIES CRUD
// ═══════════════════════════════════════════════════════════════════════════

app.post('/api/admin/categories', requireRole('admin'), async (req, res) => {
  try {
    const { name, color, kdsStation, sortOrder } = req.body;
    if (!name || !color) return res.status(400).json({ error: 'Name and color required' });
    const id = `cat-${uuid().slice(0, 8)}`;
    const { error } = await supabase.from('categories').insert({
      id, name, color, icon: '', kds_station: kdsStation || 'bar', sort_order: sortOrder || 0,
    });
    if (error) throw error;
    await logAudit(req.user.id, req.user.name, 'category_created', 'category', id, { name, color });
    const { data: cat } = await supabase.from('categories').select('*').eq('id', id).single();
    await supabase.channel('pos-events').send({ type: 'broadcast', event: 'menu:updated', payload: {} });
    res.json(cat);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/admin/categories/:id', requireRole('admin'), async (req, res) => {
  try {
    const { name, color, kdsStation, sortOrder } = req.body;
    const update = {};
    if (name) update.name = name;
    if (color) update.color = color;
    if (kdsStation) update.kds_station = kdsStation;
    if (sortOrder !== undefined) update.sort_order = sortOrder;
    await supabase.from('categories').update(update).eq('id', req.params.id);
    await logAudit(req.user.id, req.user.name, 'category_updated', 'category', req.params.id, req.body);
    const { data: cat } = await supabase.from('categories').select('*').eq('id', req.params.id).single();
    await supabase.channel('pos-events').send({ type: 'broadcast', event: 'menu:updated', payload: {} });
    res.json(cat);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/admin/categories/:id', requireRole('admin'), async (req, res) => {
  try {
    await supabase.from('categories').update({ deleted_at: new Date().toISOString() }).eq('id', req.params.id);
    await logAudit(req.user.id, req.user.name, 'category_deleted', 'category', req.params.id, null);
    await supabase.channel('pos-events').send({ type: 'broadcast', event: 'menu:updated', payload: {} });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN: PRODUCTS CRUD
// ═══════════════════════════════════════════════════════════════════════════

app.post('/api/admin/products', requireRole('admin'), async (req, res) => {
  try {
    const { name, shortName, price, categoryId, modifierGroupIds } = req.body;
    if (!name || price == null || !categoryId) return res.status(400).json({ error: 'name, price, categoryId required' });
    const id = `prod-${uuid().slice(0, 8)}`;
    await supabase.from('products').insert({
      id, category_id: categoryId, name, short_name: shortName || name.slice(0, 6).toUpperCase(),
      price, modifier_group_ids: modifierGroupIds || [],
    });
    await logAudit(req.user.id, req.user.name, 'product_created', 'product', id, { name, price, categoryId });
    const { data: prod } = await supabase.from('products').select('*').eq('id', id).single();
    await supabase.channel('pos-events').send({ type: 'broadcast', event: 'menu:updated', payload: {} });
    res.json({ ...prod, modifierGroupIds: prod.modifier_group_ids, recipe: [] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/admin/products/:id', requireRole('admin'), async (req, res) => {
  try {
    const { name, shortName, price, categoryId, modifierGroupIds } = req.body;
    const update = {};
    if (name) update.name = name;
    if (shortName) update.short_name = shortName;
    if (price !== undefined) update.price = price;
    if (categoryId) update.category_id = categoryId;
    if (modifierGroupIds) update.modifier_group_ids = modifierGroupIds;
    await supabase.from('products').update(update).eq('id', req.params.id);
    await logAudit(req.user.id, req.user.name, 'product_updated', 'product', req.params.id, req.body);
    const { data: prod } = await supabase.from('products').select('*').eq('id', req.params.id).single();
    const { data: recipe } = await supabase.from('recipes').select('inventory_item_id, quantity').eq('product_id', req.params.id);
    await supabase.channel('pos-events').send({ type: 'broadcast', event: 'menu:updated', payload: {} });
    res.json({ ...prod, modifierGroupIds: prod.modifier_group_ids, recipe: recipe || [] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/admin/products/:id', requireRole('admin'), async (req, res) => {
  try {
    await supabase.from('products').update({ deleted_at: new Date().toISOString() }).eq('id', req.params.id);
    await logAudit(req.user.id, req.user.name, 'product_deleted', 'product', req.params.id, null);
    await supabase.channel('pos-events').send({ type: 'broadcast', event: 'menu:updated', payload: {} });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN: RECIPES
// ═══════════════════════════════════════════════════════════════════════════

app.get('/api/admin/products/:id/recipe', requireRole('admin', 'supervisor'), async (req, res) => {
  try {
    const { data } = await supabase
      .from('recipes')
      .select('id, inventory_item_id, quantity')
      .eq('product_id', req.params.id);

    const { data: invItems } = await supabase.from('inventory_items').select('id, name, unit');
    const invMap = Object.fromEntries((invItems || []).map(i => [i.id, i]));

    const result = (data || []).map(r => ({
      ...r, item_name: invMap[r.inventory_item_id]?.name || '', unit: invMap[r.inventory_item_id]?.unit || '',
    }));
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/products/:id/recipe-cost', requireRole('admin', 'supervisor'), async (req, res) => {
  try {
    const { data: recipe } = await supabase
      .from('recipes')
      .select('inventory_item_id, quantity')
      .eq('product_id', req.params.id);

    const { data: invItems } = await supabase.from('inventory_items').select('id, name, unit');
    const invMap = Object.fromEntries((invItems || []).map(i => [i.id, i]));

    const { data: batches } = await supabase
      .from('inventory_batches')
      .select('inventory_item_id, cost_per_unit, quantity_remaining, received_at')
      .gt('quantity_remaining', 0)
      .order('received_at');

    const costLines = (recipe || []).map(r => {
      const batch = (batches || []).find(b => b.inventory_item_id === r.inventory_item_id);
      const costPerUnit = batch ? parseFloat(batch.cost_per_unit) : 0;
      const lineCost = r.quantity * costPerUnit;
      return {
        inventoryItemId: r.inventory_item_id,
        itemName: invMap[r.inventory_item_id]?.name || '',
        unit: invMap[r.inventory_item_id]?.unit || '',
        quantity: r.quantity, costPerUnit,
        lineCost: Math.round(lineCost * 100) / 100,
      };
    });

    const totalCost = costLines.reduce((s, l) => s + l.lineCost, 0);
    const { data: product } = await supabase.from('products').select('price').eq('id', req.params.id).single();
    const price = product ? parseFloat(product.price) : 0;
    const margin = price > 0 ? ((price - totalCost) / price * 100) : 0;

    res.json({
      lines: costLines,
      totalCost: Math.round(totalCost * 100) / 100,
      price, margin: Math.round(margin * 10) / 10,
      grossProfit: Math.round((price - totalCost) * 100) / 100,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/admin/products/:id/recipe', requireRole('admin'), async (req, res) => {
  try {
    const { recipe } = req.body;
    if (!Array.isArray(recipe)) return res.status(400).json({ error: 'recipe array required' });
    await supabase.from('recipes').delete().eq('product_id', req.params.id);
    if (recipe.length > 0) {
      await supabase.from('recipes').insert(recipe.map(r => ({
        product_id: req.params.id, inventory_item_id: r.inventoryItemId, quantity: r.quantity,
      })));
    }
    await logAudit(req.user.id, req.user.name, 'recipe_updated', 'product', req.params.id, { recipe });
    await supabase.channel('pos-events').send({ type: 'broadcast', event: 'menu:updated', payload: {} });
    const { data: updated } = await supabase.from('recipes').select('inventory_item_id, quantity').eq('product_id', req.params.id);
    res.json(updated || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN: MODIFIER GROUPS CRUD
// ═══════════════════════════════════════════════════════════════════════════

app.post('/api/admin/modifier-groups', requireRole('admin'), async (req, res) => {
  try {
    const { name, selectionType, isRequired, minSelections, maxSelections } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });
    const id = `mg-${uuid().slice(0, 8)}`;
    await supabase.from('modifier_groups').insert({
      id, name, selection_type: selectionType || 'single',
      is_required: !!isRequired, min_selections: minSelections || 0, max_selections: maxSelections || 1,
    });
    await logAudit(req.user.id, req.user.name, 'modifier_group_created', 'modifier_group', id, { name });
    const { data: g } = await supabase.from('modifier_groups').select('*').eq('id', id).single();
    await supabase.channel('pos-events').send({ type: 'broadcast', event: 'menu:updated', payload: {} });
    res.json({ ...g, isRequired: !!g.is_required, selectionType: g.selection_type, modifiers: [] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/admin/modifier-groups/:id', requireRole('admin'), async (req, res) => {
  try {
    const { name, selectionType, isRequired, minSelections, maxSelections } = req.body;
    const update = {};
    if (name) update.name = name;
    if (selectionType) update.selection_type = selectionType;
    if (isRequired !== undefined) update.is_required = !!isRequired;
    if (minSelections !== undefined) update.min_selections = minSelections;
    if (maxSelections !== undefined) update.max_selections = maxSelections;
    await supabase.from('modifier_groups').update(update).eq('id', req.params.id);
    await logAudit(req.user.id, req.user.name, 'modifier_group_updated', 'modifier_group', req.params.id, req.body);
    await supabase.channel('pos-events').send({ type: 'broadcast', event: 'menu:updated', payload: {} });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/admin/modifier-groups/:id', requireRole('admin'), async (req, res) => {
  try {
    await supabase.from('modifier_groups').update({ deleted_at: new Date().toISOString() }).eq('id', req.params.id);
    await logAudit(req.user.id, req.user.name, 'modifier_group_deleted', 'modifier_group', req.params.id, null);
    await supabase.channel('pos-events').send({ type: 'broadcast', event: 'menu:updated', payload: {} });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN: MODIFIERS CRUD
// ═══════════════════════════════════════════════════════════════════════════

app.post('/api/admin/modifiers', requireRole('admin'), async (req, res) => {
  try {
    const { groupId, name, shortName, priceAdjustment, isDefault } = req.body;
    if (!groupId || !name) return res.status(400).json({ error: 'groupId and name required' });
    const id = `mod-${uuid().slice(0, 8)}`;
    await supabase.from('modifiers').insert({
      id, group_id: groupId, name, short_name: shortName || name.slice(0, 5).toUpperCase(),
      price_adjustment: priceAdjustment || 0, is_default: !!isDefault,
    });
    await logAudit(req.user.id, req.user.name, 'modifier_created', 'modifier', id, { name, groupId });
    await supabase.channel('pos-events').send({ type: 'broadcast', event: 'menu:updated', payload: {} });
    const { data: m } = await supabase.from('modifiers').select('*').eq('id', id).single();
    res.json({ ...m, priceAdjustment: parseFloat(m.price_adjustment), shortName: m.short_name, isDefault: !!m.is_default });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/admin/modifiers/:id', requireRole('admin'), async (req, res) => {
  try {
    const { name, shortName, priceAdjustment, isDefault } = req.body;
    const update = {};
    if (name) update.name = name;
    if (shortName) update.short_name = shortName;
    if (priceAdjustment !== undefined) update.price_adjustment = priceAdjustment;
    if (isDefault !== undefined) update.is_default = !!isDefault;
    await supabase.from('modifiers').update(update).eq('id', req.params.id);
    await logAudit(req.user.id, req.user.name, 'modifier_updated', 'modifier', req.params.id, req.body);
    await supabase.channel('pos-events').send({ type: 'broadcast', event: 'menu:updated', payload: {} });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/admin/modifiers/:id', requireRole('admin'), async (req, res) => {
  try {
    await supabase.from('modifiers').update({ deleted_at: new Date().toISOString() }).eq('id', req.params.id);
    await logAudit(req.user.id, req.user.name, 'modifier_deleted', 'modifier', req.params.id, null);
    await supabase.channel('pos-events').send({ type: 'broadcast', event: 'menu:updated', payload: {} });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN: INVENTORY ITEMS CRUD
// ═══════════════════════════════════════════════════════════════════════════

app.post('/api/admin/inventory-items', requireRole('admin', 'supervisor'), async (req, res) => {
  try {
    const { name, unit, isPerishable, minimumStock } = req.body;
    if (!name || !unit) return res.status(400).json({ error: 'name and unit required' });
    const id = `inv-${uuid().slice(0, 8)}`;
    await supabase.from('inventory_items').insert({
      id, name, unit, is_perishable: !!isPerishable, minimum_stock: minimumStock || 0,
    });
    await logAudit(req.user.id, req.user.name, 'inventory_item_created', 'inventory_item', id, { name, unit });
    res.json({ id, name, unit, is_perishable: isPerishable, minimum_stock: minimumStock || 0 });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/admin/inventory-items/:id', requireRole('admin', 'supervisor'), async (req, res) => {
  try {
    const { name, unit, isPerishable, minimumStock } = req.body;
    const update = {};
    if (name) update.name = name;
    if (unit) update.unit = unit;
    if (isPerishable !== undefined) update.is_perishable = !!isPerishable;
    if (minimumStock !== undefined) update.minimum_stock = minimumStock;
    await supabase.from('inventory_items').update(update).eq('id', req.params.id);
    await logAudit(req.user.id, req.user.name, 'inventory_item_updated', 'inventory_item', req.params.id, req.body);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/admin/inventory-items/:id', requireRole('admin'), async (req, res) => {
  try {
    await supabase.from('inventory_items').update({ deleted_at: new Date().toISOString() }).eq('id', req.params.id);
    await logAudit(req.user.id, req.user.name, 'inventory_item_deleted', 'inventory_item', req.params.id, null);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN: USERS CRUD
// ═══════════════════════════════════════════════════════════════════════════

app.get('/api/admin/users', requireRole('admin'), async (req, res) => {
  try {
    const { data } = await supabase.from('users').select('id, name, role, operator_type, is_active, created_at').order('name');
    res.json(data || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/users', requireRole('admin'), async (req, res) => {
  try {
    const { name, pin, role, operatorType } = req.body;
    if (!name || !pin || !role) return res.status(400).json({ error: 'name, pin, role required' });
    if (pin.length !== 6) return res.status(400).json({ error: 'PIN must be 6 digits' });
    const id = `user-${uuid().slice(0, 8)}`;
    await supabase.from('users').insert({
      id, name, pin_hash: hashPin(pin), role,
      operator_type: role === 'operador' ? (operatorType || 'cajero') : null,
    });
    await logAudit(req.user.id, req.user.name, 'user_created', 'user', id, { name, role, operatorType });
    res.json({ id, name, role, operator_type: role === 'operador' ? (operatorType || 'cajero') : null, is_active: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/admin/users/:id', requireRole('admin'), async (req, res) => {
  try {
    const { name, pin, role, operatorType, isActive } = req.body;
    const update = {};
    if (name) update.name = name;
    if (role) {
      update.role = role;
      update.operator_type = role === 'operador' ? (operatorType || 'cajero') : null;
    } else if (operatorType !== undefined) {
      update.operator_type = operatorType;
    }
    if (pin) update.pin_hash = hashPin(pin);
    if (isActive !== undefined) update.is_active = !!isActive;
    await supabase.from('users').update(update).eq('id', req.params.id);
    await logAudit(req.user.id, req.user.name, 'user_updated', 'user', req.params.id, { name, role, operatorType, isActive });
    const { data: user } = await supabase.from('users').select('id, name, role, operator_type, is_active').eq('id', req.params.id).single();
    res.json(user);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// MODIFIER RECIPE ADJUSTMENTS
// ═══════════════════════════════════════════════════════════════════════════

app.get('/api/admin/modifier-recipe-adjustments', requireRole('admin'), async (req, res) => {
  try {
    const { data } = await supabase.from('modifier_recipe_adjustments').select('*');
    res.json(data || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/admin/modifier-recipe-adjustments/:modifierId', requireRole('admin'), async (req, res) => {
  try {
    const { adjustments } = req.body;
    if (!Array.isArray(adjustments)) return res.status(400).json({ error: 'adjustments array required' });
    await supabase.from('modifier_recipe_adjustments').delete().eq('modifier_id', req.params.modifierId);
    if (adjustments.length > 0) {
      await supabase.from('modifier_recipe_adjustments').insert(adjustments.map(a => ({
        modifier_id: req.params.modifierId,
        inventory_item_id: a.inventoryItemId,
        quantity: a.quantity,
        replaces_inventory_item_id: a.replacesInventoryItemId || null,
      })));
    }
    await logAudit(req.user.id, req.user.name, 'modifier_adjustments_updated', 'modifier', req.params.modifierId, { adjustments });
    await supabase.channel('pos-events').send({ type: 'broadcast', event: 'menu:updated', payload: {} });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// SPA FALLBACK
// ═══════════════════════════════════════════════════════════════════════════

if (fs.existsSync(FRONTEND_DIST)) {
  app.get('*', (_req, res) => {
    res.sendFile(path.join(FRONTEND_DIST, 'index.html'));
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// START SERVER
// ═══════════════════════════════════════════════════════════════════════════

async function start() {
  await seedIfEmpty();

  if (!process.env.VERCEL) {
    app.listen(PORT, '0.0.0.0', () => {
      const os = require('os');
      const interfaces = os.networkInterfaces();
      let localIp = 'localhost';
      for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
          if (iface.family === 'IPv4' && !iface.internal) { localIp = iface.address; break; }
        }
      }
      console.log('');
      console.log('  ======================================================');
      console.log('     THE STUDIO POS v4.0 — Supabase Edition             ');
      console.log('  ======================================================');
      console.log(`  Local:     http://localhost:${PORT}`);
      console.log(`  Network:   http://${localIp}:${PORT}`);
      console.log('  ======================================================');
      console.log('');
    });
  }
}

if (process.env.VERCEL) {
  seedIfEmpty().catch(err => console.error('Seed error on Vercel:', err));
} else {
  start().catch(err => { console.error('Failed to start:', err); process.exit(1); });
}

module.exports = app;
