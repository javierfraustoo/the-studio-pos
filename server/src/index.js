const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { Server } = require('socket.io');
const cors = require('cors');
const { v4: uuid } = require('uuid');
const { initDatabase, getDb, seedIfEmpty, deductFifo, resolveRecipe, logAudit, hashPin } = require('./db');
const { createToken, authMiddleware, requireRole } = require('./middleware/auth');

const PORT = process.env.PORT || 3001;
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' }, transports: ['websocket', 'polling'] });

app.use(cors());
app.use(express.json());

// Serve frontend static files in production
const FRONTEND_DIST = path.join(__dirname, '..', '..', 'frontend', 'dist');
if (fs.existsSync(FRONTEND_DIST)) {
  app.use(express.static(FRONTEND_DIST));
}

// Health check (no auth)
app.get('/health', (_req, res) => res.json({ status: 'ok', version: '3.0.0' }));

// Auth middleware for all /api routes
app.use('/api', authMiddleware);

// ═══════════════════════════════════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════════════════════════════════

// Get users list (for login screen — no auth needed, only returns names+roles)
app.get('/api/auth/users-list', (_req, res) => {
  const db = getDb();
  const users = db.prepare(`SELECT id, name, role FROM users WHERE is_active = 1 ORDER BY name`).all();
  res.json(users);
});

// Login with PIN
app.post('/api/auth/login', (req, res) => {
  const db = getDb();
  const { userId, pin } = req.body;
  if (!userId || !pin) return res.status(400).json({ error: 'Missing userId or pin' });

  const user = db.prepare('SELECT id, name, role, pin_hash, is_active FROM users WHERE id = ?').get(userId);
  if (!user || !user.is_active) return res.status(401).json({ error: 'User not found' });

  if (user.pin_hash !== hashPin(pin)) {
    logAudit(userId, user.name, 'login_failed', 'user', userId, { reason: 'wrong_pin' });
    return res.status(401).json({ error: 'PIN incorrecto' });
  }

  const token = createToken({ userId: user.id, role: user.role });
  logAudit(user.id, user.name, 'login', 'user', user.id, null);
  res.json({ token, user: { id: user.id, name: user.name, role: user.role } });
});

// Get current user info
app.get('/api/auth/me', (req, res) => {
  res.json(req.user);
});

// ═══════════════════════════════════════════════════════════════════════════
// MENU
// ═══════════════════════════════════════════════════════════════════════════

app.get('/api/menu', (_req, res) => {
  const db = getDb();
  const categories = db.prepare(`SELECT * FROM categories WHERE deleted_at IS NULL ORDER BY sort_order`).all();
  const products = db.prepare(`SELECT * FROM products WHERE deleted_at IS NULL ORDER BY name`).all().map(p => ({
    ...p,
    modifierGroupIds: JSON.parse(p.modifier_group_ids),
    recipe: db.prepare(`SELECT inventory_item_id, quantity FROM recipes WHERE product_id = ?`).all(p.id),
  }));

  const modifierGroups = db.prepare(`SELECT * FROM modifier_groups WHERE deleted_at IS NULL`).all().map(g => ({
    ...g,
    isRequired: !!g.is_required,
    selectionType: g.selection_type,
    minSelections: g.min_selections,
    maxSelections: g.max_selections,
    modifiers: db.prepare(`SELECT * FROM modifiers WHERE group_id = ? AND deleted_at IS NULL`).all(g.id).map(m => ({
      ...m,
      priceAdjustment: m.price_adjustment,
      shortName: m.short_name,
      isDefault: !!m.is_default,
    })),
  }));

  const modifierRecipeAdjustments = db.prepare(`SELECT * FROM modifier_recipe_adjustments`).all().map(a => ({
    modifierId: a.modifier_id,
    inventoryItemId: a.inventory_item_id,
    quantity: a.quantity,
    replacesInventoryItemId: a.replaces_inventory_item_id,
  }));

  res.json({ categories, products, modifierGroups, modifierRecipeAdjustments });
});

// ═══════════════════════════════════════════════════════════════════════════
// INVENTORY
// ═══════════════════════════════════════════════════════════════════════════

app.get('/api/inventory', (_req, res) => {
  const db = getDb();
  const items = db.prepare(`SELECT * FROM inventory_items WHERE deleted_at IS NULL`).all();
  const result = items.map(item => {
    const batches = db.prepare(`
      SELECT id, quantity_received, quantity_remaining, cost_per_unit, received_at, expires_at
      FROM inventory_batches
      WHERE inventory_item_id = ? AND quantity_remaining > 0
      ORDER BY received_at ASC
    `).all(item.id);
    const stock = batches.reduce((s, b) => s + b.quantity_remaining, 0);
    return { ...item, isPerishable: !!item.is_perishable, minimumStock: item.minimum_stock, stock, batches };
  });
  res.json(result);
});

app.post('/api/inventory/receive', (req, res) => {
  const db = getDb();
  const { inventoryItemId, quantity, costPerUnit, expiresAt } = req.body;
  if (!inventoryItemId || !quantity) return res.status(400).json({ error: 'Missing fields' });

  db.prepare(`
    INSERT INTO inventory_batches (inventory_item_id, quantity_received, quantity_remaining, cost_per_unit, received_at, expires_at)
    VALUES (?, ?, ?, ?, datetime('now','localtime'), ?)
  `).run(inventoryItemId, quantity, quantity, costPerUnit || 0, expiresAt || null);

  logAudit(req.user?.id, req.user?.name, 'inventory_received', 'inventory_item', inventoryItemId, { quantity, costPerUnit });
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════════════════
// ORDERS
// ═══════════════════════════════════════════════════════════════════════════

app.get('/api/orders', (req, res) => {
  const db = getDb();
  const date = req.query.date || new Date().toISOString().slice(0, 10);
  const orders = db.prepare(`SELECT * FROM orders WHERE date(created_at) = ? ORDER BY created_at DESC`).all(date);

  const result = orders.map(order => {
    const items = db.prepare(`SELECT * FROM order_items WHERE order_id = ?`).all(order.id).map(item => ({
      ...item,
      modifiers: db.prepare(`SELECT * FROM order_item_modifiers WHERE order_item_id = ?`).all(item.id).map(m => ({
        id: m.modifier_id, name: m.modifier_name, shortName: m.short_name, priceAdjustment: m.price_adjustment,
      })),
    }));
    return { ...order, items };
  });
  res.json(result);
});

app.get('/api/orders/:id', (req, res) => {
  const db = getDb();
  const order = db.prepare(`SELECT * FROM orders WHERE id = ?`).get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  const items = db.prepare(`SELECT * FROM order_items WHERE order_id = ?`).all(order.id).map(item => ({
    ...item,
    modifiers: db.prepare(`SELECT * FROM order_item_modifiers WHERE order_item_id = ?`).all(item.id).map(m => ({
      id: m.modifier_id, name: m.modifier_name, shortName: m.short_name, priceAdjustment: m.price_adjustment,
    })),
  }));

  const deductions = db.prepare(`
    SELECT im.inventory_item_id, ii.name as item_name, ii.unit, SUM(ABS(im.quantity)) as total_qty, SUM(im.cost) as total_cost
    FROM inventory_movements im
    JOIN inventory_items ii ON ii.id = im.inventory_item_id
    WHERE im.reference_id = ? AND im.movement_type = 'sale'
    GROUP BY im.inventory_item_id
  `).all(order.id);

  res.json({ ...order, items, deductions });
});

app.post('/api/orders', (req, res) => {
  const db = getDb();
  const { items, paymentMethod, customerName, orderType } = req.body;
  if (!items || !items.length) return res.status(400).json({ error: 'No items' });

  try {
    const result = db.transaction(() => {
      const today = new Date().toISOString().slice(0, 10);
      const maxRow = db.prepare(`SELECT COALESCE(MAX(order_number), 0) as maxNum FROM orders WHERE date(created_at) = ?`).get(today);
      const orderNumber = (maxRow?.maxNum || 0) + 1;

      let subtotal = 0;
      for (const item of items) subtotal += item.lineTotal;

      const orderId = uuid();
      db.prepare(`
        INSERT INTO orders (id, order_number, customer_name, order_type, payment_method, subtotal, total, user_id, user_name, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now','localtime'))
      `).run(orderId, orderNumber, customerName || '', orderType || 'dine_in', paymentMethod, subtotal, subtotal,
        req.user?.id || null, req.user?.name || null);

      let recipeCost = 0;

      for (const item of items) {
        const oiResult = db.prepare(`
          INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price, modifiers_total, line_total, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(orderId, item.productId, item.productName, item.quantity, item.unitPrice, item.modifiersTotal || 0, item.lineTotal, item.notes || '');

        const orderItemId = oiResult.lastInsertRowid;

        for (const mod of (item.modifiers || [])) {
          db.prepare(`
            INSERT INTO order_item_modifiers (order_item_id, modifier_id, modifier_name, short_name, price_adjustment)
            VALUES (?, ?, ?, ?, ?)
          `).run(orderItemId, mod.id, mod.name, mod.shortName || '', mod.priceAdjustment || 0);
        }

        const modifierIds = (item.modifiers || []).map(m => m.id);
        const materials = resolveRecipe(item.productId, modifierIds);

        for (const [invItemId, qty] of materials) {
          const totalQty = qty * item.quantity;
          const { totalCost } = deductFifo(invItemId, totalQty, 'sale', orderId);
          recipeCost += totalCost;
        }

        const product = db.prepare(`SELECT category_id FROM products WHERE id = ?`).get(item.productId);
        const category = product ? db.prepare(`SELECT kds_station FROM categories WHERE id = ?`).get(product.category_id) : null;
        const station = category?.kds_station || 'bar';

        if (station !== 'none') {
          const kdsId = uuid();
          db.prepare(`
            INSERT INTO kds_items (id, order_id, order_item_id, order_number, customer_name, order_type, product_name, quantity, modifiers_json, notes, station, status, routed_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', datetime('now','localtime'))
          `).run(kdsId, orderId, orderItemId, orderNumber, customerName || '', orderType || 'dine_in', item.productName, item.quantity, JSON.stringify((item.modifiers || []).map(m => m.shortName || m.name)), item.notes || '', station);
        }
      }

      const order = db.prepare(`SELECT * FROM orders WHERE id = ?`).get(orderId);
      const orderItems = db.prepare(`SELECT * FROM order_items WHERE order_id = ?`).all(orderId).map(oi => ({
        ...oi,
        modifiers: db.prepare(`SELECT * FROM order_item_modifiers WHERE order_item_id = ?`).all(oi.id).map(m => ({
          id: m.modifier_id, name: m.modifier_name, shortName: m.short_name, priceAdjustment: m.price_adjustment,
        })),
      }));

      const kdsItems = db.prepare(`SELECT * FROM kds_items WHERE order_id = ?`).all(orderId).map(k => ({
        ...k, modifiers: JSON.parse(k.modifiers_json),
      }));

      logAudit(req.user?.id, req.user?.name, 'order_created', 'order', orderId,
        { orderNumber, total: subtotal, items: items.length, paymentMethod });

      return { ...order, items: orderItems, kdsItems, recipeCost };
    })();

    if (result.kdsItems) {
      for (const kdsItem of result.kdsItems) {
        io.to(`kds:${kdsItem.station}`).emit('kds:new-item', kdsItem);
      }
    }
    io.emit('order:created', { id: result.id, orderNumber: result.order_number });

    res.json(result);
  } catch (err) {
    console.error('Order creation error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// KDS
// ═══════════════════════════════════════════════════════════════════════════

app.get('/api/kds/:station', (req, res) => {
  const db = getDb();
  const { station } = req.params;
  const items = db.prepare(`
    SELECT * FROM kds_items
    WHERE station = ? AND status != 'delivered'
    ORDER BY routed_at ASC
  `).all(station).map(k => ({ ...k, modifiers: JSON.parse(k.modifiers_json) }));
  res.json(items);
});

// KDS history — delivered items for current shift (today)
app.get('/api/kds/:station/history', (req, res) => {
  const db = getDb();
  const { station } = req.params;
  const date = req.query.date || new Date().toISOString().slice(0, 10);
  const items = db.prepare(`
    SELECT * FROM kds_items
    WHERE station = ? AND status = 'delivered' AND date(delivered_at) = ?
    ORDER BY delivered_at DESC
    LIMIT 50
  `).all(station, date).map(k => ({ ...k, modifiers: JSON.parse(k.modifiers_json) }));
  res.json(items);
});

app.patch('/api/kds/:itemId', (req, res) => {
  const db = getDb();
  const { itemId } = req.params;
  const { status } = req.body;

  // Allow 'pending' for undo operations
  if (!['pending', 'in_progress', 'ready', 'delivered'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  // Handle time fields — clear them when reverting
  if (status === 'pending') {
    db.prepare(`UPDATE kds_items SET status = 'pending', ready_at = NULL, delivered_at = NULL WHERE id = ?`).run(itemId);
  } else if (status === 'ready') {
    db.prepare(`UPDATE kds_items SET status = 'ready', ready_at = datetime('now','localtime'), delivered_at = NULL WHERE id = ?`).run(itemId);
  } else if (status === 'delivered') {
    db.prepare(`UPDATE kds_items SET status = 'delivered', delivered_at = datetime('now','localtime') WHERE id = ?`).run(itemId);
  } else {
    db.prepare(`UPDATE kds_items SET status = ? WHERE id = ?`).run(status, itemId);
  }

  const item = db.prepare(`SELECT * FROM kds_items WHERE id = ?`).get(itemId);
  if (item) {
    const updated = { ...item, modifiers: JSON.parse(item.modifiers_json) };
    io.to(`kds:${item.station}`).emit('kds:item-updated', updated);

    // Also broadcast globally so in-app KDS picks it up
    io.emit('kds:item-updated-global', updated);

    const pendingRow = db.prepare(`
      SELECT COUNT(*) as pending FROM kds_items WHERE order_id = ? AND status != 'delivered'
    `).get(item.order_id);
    if (pendingRow && pendingRow.pending === 0) {
      io.emit('kds:order-complete', { orderId: item.order_id, orderNumber: item.order_number });
    }
  }

  res.json({ ok: true, item: item ? { ...item, modifiers: JSON.parse(item.modifiers_json) } : null });
});

// ═══════════════════════════════════════════════════════════════════════════
// WASTE
// ═══════════════════════════════════════════════════════════════════════════

app.get('/api/waste', (req, res) => {
  const db = getDb();
  const date = req.query.date || new Date().toISOString().slice(0, 10);
  const logs = db.prepare(`SELECT * FROM waste_logs WHERE date(created_at) = ? ORDER BY created_at DESC`).all(date);
  res.json(logs);
});

app.post('/api/waste', (req, res) => {
  const db = getDb();
  const { itemType, itemId, quantity, reason, notes } = req.body;
  if (!itemId || !quantity || !reason) return res.status(400).json({ error: 'Missing fields' });

  try {
    const result = db.transaction(() => {
      const wasteId = uuid();
      let totalCost = 0;
      let itemName = '';
      let unit = 'pz';

      if (itemType === 'supply') {
        const inv = db.prepare(`SELECT * FROM inventory_items WHERE id = ?`).get(itemId);
        if (!inv) throw new Error('Inventory item not found');
        itemName = inv.name;
        unit = inv.unit;
        const { totalCost: cost } = deductFifo(itemId, quantity, 'waste', wasteId);
        totalCost = cost;
      } else if (itemType === 'product') {
        const prod = db.prepare(`SELECT * FROM products WHERE id = ?`).get(itemId);
        if (!prod) throw new Error('Product not found');
        itemName = prod.name;
        const materials = resolveRecipe(itemId, []);
        for (const [invItemId, qty] of materials) {
          const totalQty = qty * quantity;
          const { totalCost: cost } = deductFifo(invItemId, totalQty, 'waste', wasteId);
          totalCost += cost;
        }
      }

      db.prepare(`
        INSERT INTO waste_logs (id, item_type, item_id, item_name, quantity, unit, reason, notes, total_cost, user_id, user_name, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now','localtime'))
      `).run(wasteId, itemType, itemId, itemName, quantity, unit, reason, notes || '', totalCost,
        req.user?.id || null, req.user?.name || null);

      logAudit(req.user?.id, req.user?.name, 'waste_registered', 'waste', wasteId,
        { itemType, itemName, quantity, reason, totalCost });

      return db.prepare(`SELECT * FROM waste_logs WHERE id = ?`).get(wasteId);
    })();

    io.emit('waste:created', result);
    res.json(result);
  } catch (err) {
    console.error('Waste error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// ANALYTICS
// ═══════════════════════════════════════════════════════════════════════════

app.get('/api/analytics', (req, res) => {
  const db = getDb();
  const date = req.query.date || new Date().toISOString().slice(0, 10);

  const revRow = db.prepare(`
    SELECT COALESCE(SUM(total), 0) as revenue, COUNT(*) as orderCount
    FROM orders WHERE date(created_at) = ?
  `).get(date);

  const revenue = revRow?.revenue || 0;
  const orderCount = revRow?.orderCount || 0;
  const avgTicket = orderCount > 0 ? revenue / orderCount : 0;

  const wasteRow = db.prepare(`
    SELECT COALESCE(SUM(total_cost), 0) as wasteCost FROM waste_logs WHERE date(created_at) = ?
  `).get(date);
  const wasteCost = wasteRow?.wasteCost || 0;

  const recipeRow = db.prepare(`
    SELECT COALESCE(SUM(ABS(im.cost)), 0) as recipeCost
    FROM inventory_movements im
    WHERE im.movement_type = 'sale' AND date(im.created_at) = ?
  `).get(date);
  const recipeCost = recipeRow?.recipeCost || 0;

  const topSellers = db.prepare(`
    SELECT oi.product_name, oi.product_id,
      SUM(oi.quantity) as totalQty,
      SUM(oi.line_total) as totalRevenue
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE date(o.created_at) = ?
    GROUP BY oi.product_id
    ORDER BY totalQty DESC
    LIMIT 10
  `).all(date);

  const products = db.prepare(`SELECT id, name, price FROM products WHERE deleted_at IS NULL`).all();
  const profitability = products.map(p => {
    const recipe = db.prepare(`SELECT inventory_item_id, quantity FROM recipes WHERE product_id = ?`).all(p.id);
    let recipeCostPer = 0;
    for (const r of recipe) {
      const batch = db.prepare(`SELECT cost_per_unit FROM inventory_batches WHERE inventory_item_id = ? AND quantity_remaining > 0 ORDER BY received_at ASC LIMIT 1`).get(r.inventory_item_id);
      if (batch) recipeCostPer += r.quantity * batch.cost_per_unit;
    }
    const margin = p.price > 0 ? ((p.price - recipeCostPer) / p.price * 100) : 0;
    return { id: p.id, name: p.name, price: p.price, recipeCost: recipeCostPer, margin: Math.round(margin * 10) / 10 };
  }).sort((a, b) => b.margin - a.margin);

  // Sales by hour (heatmap data)
  const salesByHour = db.prepare(`
    SELECT CAST(strftime('%H', created_at) AS INTEGER) as hour,
      COALESCE(SUM(total), 0) as revenue, COUNT(*) as orders
    FROM orders WHERE date(created_at) = ?
    GROUP BY hour ORDER BY hour
  `).all(date);

  // Fill all 24 hours
  const hourlyData = Array.from({ length: 24 }, (_, h) => {
    const found = salesByHour.find(s => s.hour === h);
    return { hour: h, revenue: found?.revenue || 0, orders: found?.orders || 0 };
  });

  // Waste percentage = wasteCost / revenue * 100
  const wastePercent = revenue > 0 ? (wasteCost / revenue * 100) : 0;

  // Top 5 most profitable by margin
  const top5Profitable = profitability.filter(p => p.recipeCost > 0).slice(0, 5);

  res.json({ revenue, orderCount, avgTicket, wasteCost, recipeCost, topSellers, profitability, hourlyData, wastePercent: Math.round(wastePercent * 10) / 10, top5Profitable });
});

// Analytics: detailed orders with cajero, prep time, and gross margin
app.get('/api/analytics/orders', requireRole('admin', 'manager'), (req, res) => {
  const db = getDb();
  const date = req.query.date || new Date().toISOString().slice(0, 10);

  const orders = db.prepare(`SELECT * FROM orders WHERE date(created_at) = ? ORDER BY created_at DESC`).all(date);

  const result = orders.map(order => {
    const items = db.prepare(`SELECT * FROM order_items WHERE order_id = ?`).all(order.id).map(item => ({
      ...item,
      modifiers: db.prepare(`SELECT * FROM order_item_modifiers WHERE order_item_id = ?`).all(item.id).map(m => ({
        id: m.modifier_id, name: m.modifier_name, shortName: m.short_name, priceAdjustment: m.price_adjustment,
      })),
    }));

    // Recipe cost for this order (from inventory movements)
    const costRow = db.prepare(`
      SELECT COALESCE(SUM(ABS(im.cost)), 0) as totalCost
      FROM inventory_movements im
      WHERE im.reference_id = ? AND im.movement_type = 'sale'
    `).get(order.id);
    const recipeCost = costRow?.totalCost || 0;

    // Prep time: time from order creation to last KDS delivery
    const kdsRow = db.prepare(`
      SELECT MAX(delivered_at) as lastDelivered, MIN(routed_at) as firstRouted
      FROM kds_items WHERE order_id = ? AND status = 'delivered'
    `).get(order.id);

    let prepTimeMinutes = null;
    if (kdsRow?.lastDelivered && kdsRow?.firstRouted) {
      const start = new Date(kdsRow.firstRouted).getTime();
      const end = new Date(kdsRow.lastDelivered).getTime();
      prepTimeMinutes = Math.round((end - start) / 60000);
    }

    const grossMargin = order.total > 0 ? ((order.total - recipeCost) / order.total * 100) : 0;

    return {
      id: order.id,
      order_number: order.order_number,
      customer_name: order.customer_name,
      order_type: order.order_type,
      payment_method: order.payment_method,
      total: order.total,
      user_name: order.user_name || 'Sistema',
      created_at: order.created_at,
      items,
      recipeCost,
      prepTimeMinutes,
      grossMargin: Math.round(grossMargin * 10) / 10,
    };
  });

  res.json(result);
});

// ═══════════════════════════════════════════════════════════════════════════
// AUDIT LOG
// ═══════════════════════════════════════════════════════════════════════════

app.get('/api/audit', requireRole('admin', 'manager'), (req, res) => {
  const db = getDb();
  const limit = parseInt(req.query.limit) || 100;
  const offset = parseInt(req.query.offset) || 0;
  const { action, userId, entityType, role, date } = req.query;

  let where = '1=1';
  const params = [];

  if (action) { where += ` AND al.action = ?`; params.push(action); }
  if (userId) { where += ` AND al.user_id = ?`; params.push(userId); }
  if (entityType) { where += ` AND al.entity_type = ?`; params.push(entityType); }
  if (date) { where += ` AND date(al.created_at) = ?`; params.push(date); }
  if (role) {
    where += ` AND al.user_id IN (SELECT id FROM users WHERE role = ?)`;
    params.push(role);
  }

  const logs = db.prepare(`SELECT al.* FROM audit_log al WHERE ${where} ORDER BY al.created_at DESC LIMIT ? OFFSET ?`).all(...params, limit, offset);
  const totalRow = db.prepare(`SELECT COUNT(*) as c FROM audit_log al WHERE ${where}`).get(...params);
  res.json({ logs, total: totalRow?.c || 0 });
});

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN: CATEGORIES CRUD
// ═══════════════════════════════════════════════════════════════════════════

app.post('/api/admin/categories', requireRole('admin'), (req, res) => {
  const db = getDb();
  const { name, color, kdsStation, sortOrder } = req.body;
  if (!name || !color) return res.status(400).json({ error: 'Name and color required' });
  const id = `cat-${uuid().slice(0, 8)}`;
  db.prepare(`INSERT INTO categories (id, name, color, icon, kds_station, sort_order) VALUES (?,?,?,'',?,?)`)
    .run(id, name, color, kdsStation || 'bar', sortOrder || 0);
  logAudit(req.user.id, req.user.name, 'category_created', 'category', id, { name, color });
  const cat = db.prepare(`SELECT * FROM categories WHERE id = ?`).get(id);
  io.emit('menu:updated');
  res.json(cat);
});

app.put('/api/admin/categories/:id', requireRole('admin'), (req, res) => {
  const db = getDb();
  const { name, color, kdsStation, sortOrder } = req.body;
  db.prepare(`UPDATE categories SET name=COALESCE(?,name), color=COALESCE(?,color), kds_station=COALESCE(?,kds_station), sort_order=COALESCE(?,sort_order) WHERE id=?`)
    .run(name || null, color || null, kdsStation || null, sortOrder ?? null, req.params.id);
  logAudit(req.user.id, req.user.name, 'category_updated', 'category', req.params.id, req.body);
  const cat = db.prepare(`SELECT * FROM categories WHERE id = ?`).get(req.params.id);
  io.emit('menu:updated');
  res.json(cat);
});

app.delete('/api/admin/categories/:id', requireRole('admin'), (req, res) => {
  const db = getDb();
  db.prepare(`UPDATE categories SET deleted_at = datetime('now','localtime') WHERE id = ?`).run(req.params.id);
  logAudit(req.user.id, req.user.name, 'category_deleted', 'category', req.params.id, null);
  io.emit('menu:updated');
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN: PRODUCTS CRUD
// ═══════════════════════════════════════════════════════════════════════════

app.post('/api/admin/products', requireRole('admin'), (req, res) => {
  const db = getDb();
  const { name, shortName, price, categoryId, modifierGroupIds } = req.body;
  if (!name || price == null || !categoryId) return res.status(400).json({ error: 'name, price, categoryId required' });
  const id = `prod-${uuid().slice(0, 8)}`;
  db.prepare(`INSERT INTO products (id, category_id, name, short_name, price, modifier_group_ids) VALUES (?,?,?,?,?,?)`)
    .run(id, categoryId, name, shortName || name.slice(0, 6).toUpperCase(), price, JSON.stringify(modifierGroupIds || []));
  logAudit(req.user.id, req.user.name, 'product_created', 'product', id, { name, price, categoryId });
  const prod = db.prepare(`SELECT * FROM products WHERE id = ?`).get(id);
  io.emit('menu:updated');
  res.json({ ...prod, modifierGroupIds: JSON.parse(prod.modifier_group_ids), recipe: [] });
});

app.put('/api/admin/products/:id', requireRole('admin'), (req, res) => {
  const db = getDb();
  const { name, shortName, price, categoryId, modifierGroupIds } = req.body;
  const old = db.prepare(`SELECT * FROM products WHERE id = ?`).get(req.params.id);
  db.prepare(`UPDATE products SET name=COALESCE(?,name), short_name=COALESCE(?,short_name), price=COALESCE(?,price), category_id=COALESCE(?,category_id), modifier_group_ids=COALESCE(?,modifier_group_ids) WHERE id=?`)
    .run(name || null, shortName || null, price ?? null, categoryId || null,
      modifierGroupIds ? JSON.stringify(modifierGroupIds) : null, req.params.id);
  logAudit(req.user.id, req.user.name, 'product_updated', 'product', req.params.id,
    { before: { name: old?.name, price: old?.price }, after: { name, price } });
  const prod = db.prepare(`SELECT * FROM products WHERE id = ?`).get(req.params.id);
  const recipe = db.prepare(`SELECT inventory_item_id, quantity FROM recipes WHERE product_id = ?`).all(req.params.id);
  io.emit('menu:updated');
  res.json({ ...prod, modifierGroupIds: JSON.parse(prod.modifier_group_ids), recipe });
});

app.delete('/api/admin/products/:id', requireRole('admin'), (req, res) => {
  const db = getDb();
  db.prepare(`UPDATE products SET deleted_at = datetime('now','localtime') WHERE id = ?`).run(req.params.id);
  logAudit(req.user.id, req.user.name, 'product_deleted', 'product', req.params.id, null);
  io.emit('menu:updated');
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN: RECIPES (per product)
// ═══════════════════════════════════════════════════════════════════════════

app.get('/api/admin/products/:id/recipe', requireRole('admin', 'manager'), (req, res) => {
  const db = getDb();
  const recipe = db.prepare(`SELECT r.id, r.inventory_item_id, r.quantity, ii.name as item_name, ii.unit
    FROM recipes r JOIN inventory_items ii ON ii.id = r.inventory_item_id
    WHERE r.product_id = ?`).all(req.params.id);
  res.json(recipe);
});

// Recipe cost calculation (live cost card)
app.get('/api/admin/products/:id/recipe-cost', requireRole('admin', 'manager'), (req, res) => {
  const db = getDb();
  const recipe = db.prepare(`
    SELECT r.inventory_item_id, r.quantity, ii.name as item_name, ii.unit
    FROM recipes r JOIN inventory_items ii ON ii.id = r.inventory_item_id
    WHERE r.product_id = ?
  `).all(req.params.id);

  const costLines = recipe.map(r => {
    const batch = db.prepare(
      `SELECT cost_per_unit FROM inventory_batches WHERE inventory_item_id = ? AND quantity_remaining > 0 ORDER BY received_at ASC LIMIT 1`
    ).get(r.inventory_item_id);
    const costPerUnit = batch?.cost_per_unit || 0;
    const lineCost = r.quantity * costPerUnit;
    return {
      inventoryItemId: r.inventory_item_id,
      itemName: r.item_name,
      unit: r.unit,
      quantity: r.quantity,
      costPerUnit,
      lineCost: Math.round(lineCost * 100) / 100,
    };
  });

  const totalCost = costLines.reduce((s, l) => s + l.lineCost, 0);
  const product = db.prepare(`SELECT price FROM products WHERE id = ?`).get(req.params.id);
  const price = product?.price || 0;
  const margin = price > 0 ? ((price - totalCost) / price * 100) : 0;

  res.json({
    lines: costLines,
    totalCost: Math.round(totalCost * 100) / 100,
    price,
    margin: Math.round(margin * 10) / 10,
    grossProfit: Math.round((price - totalCost) * 100) / 100,
  });
});

app.put('/api/admin/products/:id/recipe', requireRole('admin'), (req, res) => {
  const db = getDb();
  const { recipe } = req.body; // [{inventoryItemId, quantity}]
  if (!Array.isArray(recipe)) return res.status(400).json({ error: 'recipe array required' });

  db.transaction(() => {
    db.prepare(`DELETE FROM recipes WHERE product_id = ?`).run(req.params.id);
    const insert = db.prepare(`INSERT INTO recipes (product_id, inventory_item_id, quantity) VALUES (?,?,?)`);
    for (const r of recipe) {
      insert.run(req.params.id, r.inventoryItemId, r.quantity);
    }
  })();

  logAudit(req.user.id, req.user.name, 'recipe_updated', 'product', req.params.id, { recipe });
  io.emit('menu:updated');
  const updated = db.prepare(`SELECT inventory_item_id, quantity FROM recipes WHERE product_id = ?`).all(req.params.id);
  res.json(updated);
});

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN: MODIFIER GROUPS CRUD
// ═══════════════════════════════════════════════════════════════════════════

app.post('/api/admin/modifier-groups', requireRole('admin'), (req, res) => {
  const db = getDb();
  const { name, selectionType, isRequired, minSelections, maxSelections } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const id = `mg-${uuid().slice(0, 8)}`;
  db.prepare(`INSERT INTO modifier_groups (id, name, selection_type, is_required, min_selections, max_selections) VALUES (?,?,?,?,?,?)`)
    .run(id, name, selectionType || 'single', isRequired ? 1 : 0, minSelections || 0, maxSelections || 1);
  logAudit(req.user.id, req.user.name, 'modifier_group_created', 'modifier_group', id, { name });
  const g = db.prepare(`SELECT * FROM modifier_groups WHERE id = ?`).get(id);
  io.emit('menu:updated');
  res.json({ ...g, isRequired: !!g.is_required, selectionType: g.selection_type, modifiers: [] });
});

app.put('/api/admin/modifier-groups/:id', requireRole('admin'), (req, res) => {
  const db = getDb();
  const { name, selectionType, isRequired, minSelections, maxSelections } = req.body;
  db.prepare(`UPDATE modifier_groups SET name=COALESCE(?,name), selection_type=COALESCE(?,selection_type), is_required=COALESCE(?,is_required), min_selections=COALESCE(?,min_selections), max_selections=COALESCE(?,max_selections) WHERE id=?`)
    .run(name || null, selectionType || null, isRequired !== undefined ? (isRequired ? 1 : 0) : null, minSelections ?? null, maxSelections ?? null, req.params.id);
  logAudit(req.user.id, req.user.name, 'modifier_group_updated', 'modifier_group', req.params.id, req.body);
  io.emit('menu:updated');
  res.json({ ok: true });
});

app.delete('/api/admin/modifier-groups/:id', requireRole('admin'), (req, res) => {
  const db = getDb();
  db.prepare(`UPDATE modifier_groups SET deleted_at = datetime('now','localtime') WHERE id = ?`).run(req.params.id);
  logAudit(req.user.id, req.user.name, 'modifier_group_deleted', 'modifier_group', req.params.id, null);
  io.emit('menu:updated');
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN: MODIFIERS CRUD
// ═══════════════════════════════════════════════════════════════════════════

app.post('/api/admin/modifiers', requireRole('admin'), (req, res) => {
  const db = getDb();
  const { groupId, name, shortName, priceAdjustment, isDefault } = req.body;
  if (!groupId || !name) return res.status(400).json({ error: 'groupId and name required' });
  const id = `mod-${uuid().slice(0, 8)}`;
  db.prepare(`INSERT INTO modifiers (id, group_id, name, short_name, price_adjustment, is_default) VALUES (?,?,?,?,?,?)`)
    .run(id, groupId, name, shortName || name.slice(0, 5).toUpperCase(), priceAdjustment || 0, isDefault ? 1 : 0);
  logAudit(req.user.id, req.user.name, 'modifier_created', 'modifier', id, { name, groupId });
  io.emit('menu:updated');
  const m = db.prepare(`SELECT * FROM modifiers WHERE id = ?`).get(id);
  res.json({ ...m, priceAdjustment: m.price_adjustment, shortName: m.short_name, isDefault: !!m.is_default });
});

app.put('/api/admin/modifiers/:id', requireRole('admin'), (req, res) => {
  const db = getDb();
  const { name, shortName, priceAdjustment, isDefault } = req.body;
  db.prepare(`UPDATE modifiers SET name=COALESCE(?,name), short_name=COALESCE(?,short_name), price_adjustment=COALESCE(?,price_adjustment), is_default=COALESCE(?,is_default) WHERE id=?`)
    .run(name || null, shortName || null, priceAdjustment ?? null, isDefault !== undefined ? (isDefault ? 1 : 0) : null, req.params.id);
  logAudit(req.user.id, req.user.name, 'modifier_updated', 'modifier', req.params.id, req.body);
  io.emit('menu:updated');
  res.json({ ok: true });
});

app.delete('/api/admin/modifiers/:id', requireRole('admin'), (req, res) => {
  const db = getDb();
  db.prepare(`UPDATE modifiers SET deleted_at = datetime('now','localtime') WHERE id = ?`).run(req.params.id);
  logAudit(req.user.id, req.user.name, 'modifier_deleted', 'modifier', req.params.id, null);
  io.emit('menu:updated');
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN: INVENTORY ITEMS CRUD
// ═══════════════════════════════════════════════════════════════════════════

app.post('/api/admin/inventory-items', requireRole('admin', 'manager'), (req, res) => {
  const db = getDb();
  const { name, unit, isPerishable, minimumStock } = req.body;
  if (!name || !unit) return res.status(400).json({ error: 'name and unit required' });
  const id = `inv-${uuid().slice(0, 8)}`;
  db.prepare(`INSERT INTO inventory_items (id, name, unit, is_perishable, minimum_stock) VALUES (?,?,?,?,?)`)
    .run(id, name, unit, isPerishable ? 1 : 0, minimumStock || 0);
  logAudit(req.user.id, req.user.name, 'inventory_item_created', 'inventory_item', id, { name, unit });
  res.json({ id, name, unit, is_perishable: isPerishable ? 1 : 0, minimum_stock: minimumStock || 0 });
});

app.put('/api/admin/inventory-items/:id', requireRole('admin', 'manager'), (req, res) => {
  const db = getDb();
  const { name, unit, isPerishable, minimumStock } = req.body;
  db.prepare(`UPDATE inventory_items SET name=COALESCE(?,name), unit=COALESCE(?,unit), is_perishable=COALESCE(?,is_perishable), minimum_stock=COALESCE(?,minimum_stock) WHERE id=?`)
    .run(name || null, unit || null, isPerishable !== undefined ? (isPerishable ? 1 : 0) : null, minimumStock ?? null, req.params.id);
  logAudit(req.user.id, req.user.name, 'inventory_item_updated', 'inventory_item', req.params.id, req.body);
  res.json({ ok: true });
});

app.delete('/api/admin/inventory-items/:id', requireRole('admin'), (req, res) => {
  const db = getDb();
  db.prepare(`UPDATE inventory_items SET deleted_at = datetime('now','localtime') WHERE id = ?`).run(req.params.id);
  logAudit(req.user.id, req.user.name, 'inventory_item_deleted', 'inventory_item', req.params.id, null);
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN: USERS CRUD
// ═══════════════════════════════════════════════════════════════════════════

app.get('/api/admin/users', requireRole('admin'), (req, res) => {
  const db = getDb();
  const users = db.prepare(`SELECT id, name, role, is_active, created_at FROM users ORDER BY name`).all();
  res.json(users);
});

app.post('/api/admin/users', requireRole('admin'), (req, res) => {
  const db = getDb();
  const { name, pin, role } = req.body;
  if (!name || !pin || !role) return res.status(400).json({ error: 'name, pin, role required' });
  if (pin.length !== 6) return res.status(400).json({ error: 'PIN must be 6 digits' });
  const id = `user-${uuid().slice(0, 8)}`;
  db.prepare(`INSERT INTO users (id, name, pin_hash, role, is_active) VALUES (?,?,?,?,1)`)
    .run(id, name, hashPin(pin), role);
  logAudit(req.user.id, req.user.name, 'user_created', 'user', id, { name, role });
  res.json({ id, name, role, is_active: 1 });
});

app.put('/api/admin/users/:id', requireRole('admin'), (req, res) => {
  const db = getDb();
  const { name, pin, role, isActive } = req.body;
  if (name) db.prepare(`UPDATE users SET name = ? WHERE id = ?`).run(name, req.params.id);
  if (role) db.prepare(`UPDATE users SET role = ? WHERE id = ?`).run(role, req.params.id);
  if (pin) db.prepare(`UPDATE users SET pin_hash = ? WHERE id = ?`).run(hashPin(pin), req.params.id);
  if (isActive !== undefined) db.prepare(`UPDATE users SET is_active = ? WHERE id = ?`).run(isActive ? 1 : 0, req.params.id);
  logAudit(req.user.id, req.user.name, 'user_updated', 'user', req.params.id, { name, role, isActive });
  const user = db.prepare(`SELECT id, name, role, is_active FROM users WHERE id = ?`).get(req.params.id);
  res.json(user);
});

// ═══════════════════════════════════════════════════════════════════════════
// MODIFIER RECIPE ADJUSTMENTS
// ═══════════════════════════════════════════════════════════════════════════

app.get('/api/admin/modifier-recipe-adjustments', requireRole('admin'), (req, res) => {
  const db = getDb();
  const adjs = db.prepare(`SELECT * FROM modifier_recipe_adjustments`).all();
  res.json(adjs);
});

app.put('/api/admin/modifier-recipe-adjustments/:modifierId', requireRole('admin'), (req, res) => {
  const db = getDb();
  const { adjustments } = req.body; // [{inventoryItemId, quantity, replacesInventoryItemId}]
  if (!Array.isArray(adjustments)) return res.status(400).json({ error: 'adjustments array required' });

  db.transaction(() => {
    db.prepare(`DELETE FROM modifier_recipe_adjustments WHERE modifier_id = ?`).run(req.params.modifierId);
    const insert = db.prepare(`INSERT INTO modifier_recipe_adjustments (modifier_id, inventory_item_id, quantity, replaces_inventory_item_id) VALUES (?,?,?,?)`);
    for (const a of adjustments) {
      insert.run(req.params.modifierId, a.inventoryItemId, a.quantity, a.replacesInventoryItemId || null);
    }
  })();

  logAudit(req.user.id, req.user.name, 'modifier_adjustments_updated', 'modifier', req.params.modifierId, { adjustments });
  io.emit('menu:updated');
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════════════════
// WEBSOCKET
// ═══════════════════════════════════════════════════════════════════════════

io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  socket.on('kds:join', (station) => {
    socket.join(`kds:${station}`);
    console.log(`${socket.id} joined kds:${station}`);
  });

  socket.on('kds:mark-ready', (itemId) => {
    const db = getDb();
    db.prepare(`UPDATE kds_items SET status = 'ready', ready_at = datetime('now','localtime') WHERE id = ?`).run(itemId);
    const item = db.prepare(`SELECT * FROM kds_items WHERE id = ?`).get(itemId);
    if (item) {
      io.to(`kds:${item.station}`).emit('kds:item-updated', { ...item, modifiers: JSON.parse(item.modifiers_json) });
    }
  });

  socket.on('kds:mark-delivered', (itemId) => {
    const db = getDb();
    db.prepare(`UPDATE kds_items SET status = 'delivered', delivered_at = datetime('now','localtime') WHERE id = ?`).run(itemId);
    const item = db.prepare(`SELECT * FROM kds_items WHERE id = ?`).get(itemId);
    if (item) {
      io.to(`kds:${item.station}`).emit('kds:item-updated', { ...item, modifiers: JSON.parse(item.modifiers_json) });
      const pendingRow = db.prepare(`SELECT COUNT(*) as pending FROM kds_items WHERE order_id = ? AND status != 'delivered'`).get(item.order_id);
      if (pendingRow && pendingRow.pending === 0) {
        io.emit('kds:order-complete', { orderId: item.order_id, orderNumber: item.order_number });
      }
    }
  });

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SPA FALLBACK (for React Router — must be after all API routes)
// ═══════════════════════════════════════════════════════════════════════════

if (fs.existsSync(FRONTEND_DIST)) {
  app.get('*', (_req, res) => {
    res.sendFile(path.join(FRONTEND_DIST, 'index.html'));
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// START SERVER (async init)
// ═══════════════════════════════════════════════════════════════════════════

async function start() {
  await initDatabase();
  seedIfEmpty();

  // On Vercel, don't bind to a port — the serverless runtime handles that
  if (!process.env.VERCEL) {
    server.listen(PORT, '0.0.0.0', () => {
      const os = require('os');
      const interfaces = os.networkInterfaces();
      let localIp = 'localhost';
      for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
          if (iface.family === 'IPv4' && !iface.internal) {
            localIp = iface.address;
            break;
          }
        }
      }
      console.log('');
      console.log('  ======================================================');
      console.log('         THE STUDIO POS -- Server v3.0 (Cloud-Ready)     ');
      console.log('  ======================================================');
      console.log(`  Local:     http://localhost:${PORT}`);
      console.log(`  Network:   http://${localIp}:${PORT}`);
      console.log('');
      console.log('  Routes:');
      console.log('    POS:        /');
      console.log('    Admin:      /admin');
      console.log('    KDS Barra:  /kds/barra');
      console.log('    KDS Cocina: /kds/cocina');
      console.log('');
      console.log('  Default Users (POS):');
      console.log('    Admin:       PIN 123456');
      console.log('    Supervisor:  PIN 654321');
      console.log('    Cajero 1:    PIN 111111');
      console.log('    Cajero 2:    PIN 222222');
      console.log('    Cubreturno:  PIN 333333');
      console.log('  KDS Only:');
      console.log('    Barista 1:   PIN 444444');
      console.log('    Cocina 1:    PIN 555555');
      console.log('  ======================================================');
      console.log('');
    });
  }
}

// On Vercel, initialize the database eagerly so the app is ready to handle requests
if (process.env.VERCEL) {
  initDatabase().then(() => seedIfEmpty()).catch(err => {
    console.error('Failed to initialize database on Vercel:', err);
  });
} else {
  start().catch(err => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}

// Export the Express app for Vercel serverless functions
module.exports = app;
