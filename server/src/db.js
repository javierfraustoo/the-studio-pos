const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// ─── Database Setup ─────────────────────────────────────────────────────────

// On Vercel, the filesystem is read-only except for /tmp/
const DATA_DIR = process.env.VERCEL
  ? '/tmp'
  : path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'studio-pos.db');

// ─── sql.js wrapper with better-sqlite3-like API ────────────────────────────

class Database {
  constructor(sqlDb) {
    this._db = sqlDb;
    this._saveTimer = null;
  }

  exec(sql) {
    this._db.run(sql);
    this._scheduleSave();
  }

  pragma(str) {
    this._db.run(`PRAGMA ${str}`);
  }

  prepare(sql) {
    const db = this;
    return {
      run(...params) {
        db._db.run(sql, params);
        const r = db._db.exec('SELECT last_insert_rowid() as lid, changes() as c');
        db._scheduleSave();
        return { lastInsertRowid: r[0]?.values[0]?.[0] || 0, changes: r[0]?.values[0]?.[1] || 0 };
      },
      get(...params) {
        let row;
        try {
          const stmt = db._db.prepare(sql);
          stmt.bind(params);
          if (stmt.step()) row = stmt.getAsObject();
          stmt.free();
        } catch (e) {
          // Return undefined on error
        }
        return row;
      },
      all(...params) {
        const rows = [];
        try {
          const stmt = db._db.prepare(sql);
          stmt.bind(params);
          while (stmt.step()) rows.push(stmt.getAsObject());
          stmt.free();
        } catch (e) {
          // Return empty on error
        }
        return rows;
      },
    };
  }

  transaction(fn) {
    const self = this;
    return function(...args) {
      self._db.run('BEGIN');
      try {
        const result = fn(...args);
        self._db.run('COMMIT');
        self._save();
        return result;
      } catch (err) {
        self._db.run('ROLLBACK');
        throw err;
      }
    };
  }

  _scheduleSave() {
    if (this._saveTimer) return;
    this._saveTimer = setTimeout(() => {
      this._save();
      this._saveTimer = null;
    }, 500);
  }

  _save() {
    const data = this._db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  }
}

// ─── PIN hashing ────────────────────────────────────────────────────────────

function hashPin(pin) {
  return crypto.createHash('sha256').update(pin.toString()).digest('hex');
}

// ─── Async init ──────────────────────────────────────────────────────────────

let db;

async function initDatabase() {
  const SQL = await initSqlJs();

  let sqlDb;
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    sqlDb = new SQL.Database(buffer);
  } else {
    sqlDb = new SQL.Database();
  }

  db = new Database(sqlDb);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // ─── Schema ──────────────────────────────────────────────────────────────

  // sql.js _db.run() handles multi-statement SQL via exec internally
  const statements = [
    // ── Auth & Users ──
    `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      pin_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'cashier',
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    )`,
    `CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      token TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    )`,
    `CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      user_name TEXT,
      action TEXT NOT NULL,
      entity_type TEXT,
      entity_id TEXT,
      details TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    )`,

    // ── Menu & Catalog ──
    `CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      color TEXT NOT NULL,
      icon TEXT DEFAULT '',
      kds_station TEXT DEFAULT 'bar',
      sort_order INTEGER DEFAULT 0,
      deleted_at TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      category_id TEXT NOT NULL REFERENCES categories(id),
      name TEXT NOT NULL,
      short_name TEXT NOT NULL DEFAULT '',
      price REAL NOT NULL,
      modifier_group_ids TEXT DEFAULT '[]',
      deleted_at TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS recipes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id TEXT NOT NULL REFERENCES products(id),
      inventory_item_id TEXT NOT NULL,
      quantity REAL NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS modifier_groups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      selection_type TEXT NOT NULL DEFAULT 'single',
      is_required INTEGER DEFAULT 0,
      min_selections INTEGER DEFAULT 0,
      max_selections INTEGER DEFAULT 1,
      deleted_at TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS modifiers (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL REFERENCES modifier_groups(id),
      name TEXT NOT NULL,
      short_name TEXT NOT NULL DEFAULT '',
      price_adjustment REAL DEFAULT 0,
      is_default INTEGER DEFAULT 0,
      deleted_at TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS modifier_recipe_adjustments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      modifier_id TEXT NOT NULL,
      inventory_item_id TEXT NOT NULL,
      quantity REAL NOT NULL,
      replaces_inventory_item_id TEXT
    )`,

    // ── Inventory ──
    `CREATE TABLE IF NOT EXISTS inventory_items (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      unit TEXT NOT NULL,
      is_perishable INTEGER DEFAULT 0,
      minimum_stock REAL DEFAULT 0,
      deleted_at TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS inventory_batches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      inventory_item_id TEXT NOT NULL REFERENCES inventory_items(id),
      quantity_received REAL NOT NULL,
      quantity_remaining REAL NOT NULL,
      cost_per_unit REAL NOT NULL,
      received_at TEXT NOT NULL,
      expires_at TEXT
    )`,

    // ── Orders ──
    `CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      order_number INTEGER NOT NULL,
      customer_name TEXT DEFAULT '',
      order_type TEXT NOT NULL,
      payment_method TEXT NOT NULL,
      subtotal REAL NOT NULL,
      total REAL NOT NULL,
      user_id TEXT,
      user_name TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    )`,
    `CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id TEXT NOT NULL REFERENCES orders(id),
      product_id TEXT NOT NULL,
      product_name TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      unit_price REAL NOT NULL,
      modifiers_total REAL NOT NULL DEFAULT 0,
      line_total REAL NOT NULL,
      notes TEXT DEFAULT ''
    )`,
    `CREATE TABLE IF NOT EXISTS order_item_modifiers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_item_id INTEGER NOT NULL REFERENCES order_items(id),
      modifier_id TEXT NOT NULL,
      modifier_name TEXT NOT NULL,
      short_name TEXT NOT NULL DEFAULT '',
      price_adjustment REAL DEFAULT 0
    )`,

    // ── Inventory Movements ──
    `CREATE TABLE IF NOT EXISTS inventory_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      inventory_item_id TEXT NOT NULL,
      batch_id INTEGER,
      quantity REAL NOT NULL,
      movement_type TEXT NOT NULL,
      reference_id TEXT,
      cost REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    )`,

    // ── KDS ──
    `CREATE TABLE IF NOT EXISTS kds_items (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      order_item_id INTEGER NOT NULL,
      order_number INTEGER NOT NULL,
      customer_name TEXT DEFAULT '',
      order_type TEXT NOT NULL,
      product_name TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      modifiers_json TEXT DEFAULT '[]',
      notes TEXT DEFAULT '',
      station TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      routed_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      ready_at TEXT,
      delivered_at TEXT
    )`,

    // ── Waste ──
    `CREATE TABLE IF NOT EXISTS waste_logs (
      id TEXT PRIMARY KEY,
      item_type TEXT NOT NULL,
      item_id TEXT NOT NULL,
      item_name TEXT NOT NULL,
      quantity REAL NOT NULL,
      unit TEXT NOT NULL,
      reason TEXT NOT NULL,
      notes TEXT DEFAULT '',
      total_cost REAL NOT NULL DEFAULT 0,
      user_id TEXT,
      user_name TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    )`,
  ];

  for (const sql of statements) {
    try { sqlDb.run(sql); } catch (e) { /* table likely already exists */ }
  }

  // ── Migrations: add columns if missing ──
  const migrations = [
    { table: 'orders', column: 'user_id', sql: `ALTER TABLE orders ADD COLUMN user_id TEXT` },
    { table: 'orders', column: 'user_name', sql: `ALTER TABLE orders ADD COLUMN user_name TEXT` },
    { table: 'waste_logs', column: 'user_id', sql: `ALTER TABLE waste_logs ADD COLUMN user_id TEXT` },
    { table: 'waste_logs', column: 'user_name', sql: `ALTER TABLE waste_logs ADD COLUMN user_name TEXT` },
    { table: 'categories', column: 'deleted_at', sql: `ALTER TABLE categories ADD COLUMN deleted_at TEXT` },
    { table: 'modifier_groups', column: 'deleted_at', sql: `ALTER TABLE modifier_groups ADD COLUMN deleted_at TEXT` },
    { table: 'modifiers', column: 'deleted_at', sql: `ALTER TABLE modifiers ADD COLUMN deleted_at TEXT` },
  ];

  for (const m of migrations) {
    try { sqlDb.run(m.sql); } catch (e) { /* column already exists */ }
  }

  db._save();
  return db;
}

// ─── FIFO Deduction Helper ──────────────────────────────────────────────────

function deductFifo(inventoryItemId, quantity, movementType, referenceId) {
  const batches = db.prepare(`
    SELECT id, quantity_remaining, cost_per_unit
    FROM inventory_batches
    WHERE inventory_item_id = ? AND quantity_remaining > 0
    ORDER BY received_at ASC
  `).all(inventoryItemId);

  let remaining = quantity;
  let totalCost = 0;

  for (const batch of batches) {
    if (remaining <= 0) break;
    const deduct = Math.min(remaining, batch.quantity_remaining);
    db.prepare(`UPDATE inventory_batches SET quantity_remaining = quantity_remaining - ? WHERE id = ?`).run(deduct, batch.id);
    const cost = deduct * batch.cost_per_unit;
    db.prepare(`
      INSERT INTO inventory_movements (inventory_item_id, batch_id, quantity, movement_type, reference_id, cost, created_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now','localtime'))
    `).run(inventoryItemId, batch.id, -deduct, movementType, referenceId, cost);
    totalCost += cost;
    remaining -= deduct;
  }

  return { totalCost, shortfall: Math.max(0, remaining) };
}

// ─── Recipe Resolution Helper ───────────────────────────────────────────────

function resolveRecipe(productId, modifierIds) {
  const baseRecipe = db.prepare(`SELECT inventory_item_id, quantity FROM recipes WHERE product_id = ?`).all(productId);
  const materials = new Map();

  for (const r of baseRecipe) {
    materials.set(r.inventory_item_id, (materials.get(r.inventory_item_id) || 0) + r.quantity);
  }

  for (const modId of modifierIds) {
    const adjustments = db.prepare(`SELECT inventory_item_id, quantity, replaces_inventory_item_id FROM modifier_recipe_adjustments WHERE modifier_id = ?`).all(modId);
    for (const adj of adjustments) {
      if (adj.replaces_inventory_item_id && materials.has(adj.replaces_inventory_item_id)) {
        materials.delete(adj.replaces_inventory_item_id);
      }
      materials.set(adj.inventory_item_id, (materials.get(adj.inventory_item_id) || 0) + adj.quantity);
    }
  }

  return materials;
}

// ─── Audit Logger ───────────────────────────────────────────────────────────

function logAudit(userId, userName, action, entityType, entityId, details) {
  try {
    db.prepare(`
      INSERT INTO audit_log (user_id, user_name, action, entity_type, entity_id, details, created_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now','localtime'))
    `).run(userId || null, userName || null, action, entityType || null, entityId || null, details ? JSON.stringify(details) : null);
  } catch (e) {
    console.error('Audit log error:', e.message);
  }
}

// ─── Seed Data ──────────────────────────────────────────────────────────────

function seedIfEmpty() {
  const row = db.prepare('SELECT COUNT(*) as c FROM categories').get();
  if (row && row.c > 0) return false;

  const tx = db.transaction(() => {
    // ── Users (PIN is hashed) ──
    // 5 POS accounts + barista/kitchen (KDS-only, blocked from POS)
    const insertUser = db.prepare(`INSERT INTO users (id, name, pin_hash, role, is_active) VALUES (?,?,?,?,1)`);
    insertUser.run('user-admin', 'Administrador', hashPin('123456'), 'admin');
    insertUser.run('user-supervisor', 'Supervisor', hashPin('654321'), 'manager');
    insertUser.run('user-cajero1', 'Cajero 1', hashPin('111111'), 'cashier');
    insertUser.run('user-cajero2', 'Cajero 2', hashPin('222222'), 'cashier');
    insertUser.run('user-cubreturno', 'Cubreturno', hashPin('333333'), 'cashier');
    insertUser.run('user-barista1', 'Barista 1', hashPin('444444'), 'barista');
    insertUser.run('user-cocina1', 'Cocina 1', hashPin('555555'), 'kitchen');

    // Categories
    const insertCat = db.prepare(`INSERT INTO categories (id, name, color, icon, kds_station, sort_order) VALUES (?,?,?,?,?,?)`);
    insertCat.run('cat-espresso', 'Espresso', '#78350F', 'coffee', 'bar', 0);
    insertCat.run('cat-filter', 'Filtrado', '#92400E', 'filter', 'bar', 1);
    insertCat.run('cat-cold', 'Frias', '#1E40AF', 'snowflake', 'bar', 2);
    insertCat.run('cat-food', 'Alimentos', '#065F46', 'croissant', 'kitchen', 3);
    insertCat.run('cat-retail', 'Retail', '#6B21A8', 'bag', 'none', 4);

    // Modifier Groups
    const insertMG = db.prepare(`INSERT INTO modifier_groups (id, name, selection_type, is_required, min_selections, max_selections) VALUES (?,?,?,?,?,?)`);
    insertMG.run('mg-milk', 'Tipo de Leche', 'single', 1, 1, 1);
    insertMG.run('mg-temp', 'Temperatura', 'single', 0, 0, 1);
    insertMG.run('mg-shots', 'Shots Extra', 'multiple', 0, 0, 3);
    insertMG.run('mg-syrup', 'Jarabe', 'multiple', 0, 0, 3);
    insertMG.run('mg-size', 'Tamano', 'single', 1, 1, 1);
    insertMG.run('mg-filter-method', 'Metodo', 'single', 1, 1, 1);

    // Modifiers
    const insertMod = db.prepare(`INSERT INTO modifiers (id, group_id, name, short_name, price_adjustment, is_default) VALUES (?,?,?,?,?,?)`);
    insertMod.run('mod-whole', 'mg-milk', 'Leche Entera', 'ENTERA', 0, 1);
    insertMod.run('mod-oat', 'mg-milk', 'Leche de Avena', 'AVENA', 15, 0);
    insertMod.run('mod-almond', 'mg-milk', 'Leche de Almendra', 'ALMND', 15, 0);
    insertMod.run('mod-coconut', 'mg-milk', 'Leche de Coco', 'COCO', 15, 0);
    insertMod.run('mod-skim', 'mg-milk', 'Leche Descremada', 'DESCR', 0, 0);
    insertMod.run('mod-normal-temp', 'mg-temp', 'Normal', 'NORM', 0, 1);
    insertMod.run('mod-extra-hot', 'mg-temp', 'Extra Caliente', 'XHOT', 0, 0);
    insertMod.run('mod-warm', 'mg-temp', 'Tibio', 'TIBIO', 0, 0);
    insertMod.run('mod-extra-shot', 'mg-shots', 'Shot Extra', '+SHOT', 12, 0);
    insertMod.run('mod-decaf-shot', 'mg-shots', 'Shot Descaf', 'DECAF', 12, 0);
    insertMod.run('mod-vanilla', 'mg-syrup', 'Vainilla', 'VAIN', 10, 0);
    insertMod.run('mod-caramel', 'mg-syrup', 'Caramelo', 'CARAM', 10, 0);
    insertMod.run('mod-hazelnut', 'mg-syrup', 'Avellana', 'AVELL', 10, 0);
    insertMod.run('mod-mocha', 'mg-syrup', 'Mocha', 'MOCHA', 10, 0);
    insertMod.run('mod-8oz', 'mg-size', '8 oz', '8oz', 0, 1);
    insertMod.run('mod-12oz', 'mg-size', '12 oz', '12oz', 15, 0);
    insertMod.run('mod-16oz', 'mg-size', '16 oz', '16oz', 25, 0);
    insertMod.run('mod-v60', 'mg-filter-method', 'V60', 'V60', 0, 1);
    insertMod.run('mod-chemex', 'mg-filter-method', 'Chemex', 'CHMX', 10, 0);
    insertMod.run('mod-aeropress', 'mg-filter-method', 'AeroPress', 'AERO', 0, 0);

    // Modifier Recipe Adjustments
    const insertMRA = db.prepare(`INSERT INTO modifier_recipe_adjustments (modifier_id, inventory_item_id, quantity, replaces_inventory_item_id) VALUES (?,?,?,?)`);
    insertMRA.run('mod-oat', 'inv-oat-milk', 250, 'inv-whole-milk');
    insertMRA.run('mod-almond', 'inv-almond-milk', 250, 'inv-whole-milk');
    insertMRA.run('mod-coconut', 'inv-coconut-milk', 250, 'inv-whole-milk');
    insertMRA.run('mod-skim', 'inv-skim-milk', 250, 'inv-whole-milk');
    insertMRA.run('mod-extra-shot', 'inv-coffee-beans', 18, null);
    insertMRA.run('mod-decaf-shot', 'inv-coffee-beans', 18, null);
    insertMRA.run('mod-vanilla', 'inv-vanilla-syrup', 15, null);
    insertMRA.run('mod-caramel', 'inv-caramel-syrup', 15, null);
    insertMRA.run('mod-hazelnut', 'inv-hazelnut-syrup', 15, null);
    insertMRA.run('mod-mocha', 'inv-mocha-syrup', 15, null);
    insertMRA.run('mod-12oz', 'inv-cup-12oz', 1, 'inv-cup-8oz');
    insertMRA.run('mod-16oz', 'inv-cup-16oz', 1, 'inv-cup-8oz');

    // Products
    const insertProd = db.prepare(`INSERT INTO products (id, category_id, name, short_name, price, modifier_group_ids) VALUES (?,?,?,?,?,?)`);
    const insertRecipe = db.prepare(`INSERT INTO recipes (product_id, inventory_item_id, quantity) VALUES (?,?,?)`);

    const products = [
      { id: 'prod-espresso', cat: 'cat-espresso', name: 'Espresso', short: 'ESPRES', price: 45, mods: ['mg-shots'], recipe: [['inv-coffee-beans',18],['inv-cup-8oz',1]] },
      { id: 'prod-americano', cat: 'cat-espresso', name: 'Americano', short: 'AMRCNO', price: 55, mods: ['mg-size','mg-shots','mg-temp'], recipe: [['inv-coffee-beans',18],['inv-cup-8oz',1],['inv-lid',1]] },
      { id: 'prod-latte', cat: 'cat-espresso', name: 'Latte', short: 'LATTE', price: 70, mods: ['mg-size','mg-milk','mg-shots','mg-temp','mg-syrup'], recipe: [['inv-coffee-beans',18],['inv-whole-milk',250],['inv-cup-8oz',1],['inv-lid',1]] },
      { id: 'prod-cappuccino', cat: 'cat-espresso', name: 'Cappuccino', short: 'CAPPUC', price: 70, mods: ['mg-size','mg-milk','mg-shots','mg-temp'], recipe: [['inv-coffee-beans',18],['inv-whole-milk',180],['inv-cup-8oz',1],['inv-lid',1]] },
      { id: 'prod-flatwhite', cat: 'cat-espresso', name: 'Flat White', short: 'FLTWHT', price: 75, mods: ['mg-milk','mg-shots','mg-temp'], recipe: [['inv-coffee-beans',36],['inv-whole-milk',150],['inv-cup-8oz',1],['inv-lid',1]] },
      { id: 'prod-mocha', cat: 'cat-espresso', name: 'Mocha', short: 'MOCHA', price: 80, mods: ['mg-size','mg-milk','mg-shots','mg-temp'], recipe: [['inv-coffee-beans',18],['inv-whole-milk',200],['inv-mocha-syrup',30],['inv-cup-8oz',1],['inv-lid',1]] },
      { id: 'prod-v60', cat: 'cat-filter', name: 'Cafe Filtrado', short: 'FILTRO', price: 65, mods: ['mg-filter-method'], recipe: [['inv-coffee-beans',20],['inv-filter-paper',1],['inv-cup-12oz',1],['inv-lid',1]] },
      { id: 'prod-iced-latte', cat: 'cat-cold', name: 'Iced Latte', short: 'ICLTTE', price: 80, mods: ['mg-milk','mg-shots','mg-syrup'], recipe: [['inv-coffee-beans',18],['inv-whole-milk',250],['inv-ice',200],['inv-cold-cup-16oz',1],['inv-cold-lid',1]] },
      { id: 'prod-cold-brew', cat: 'cat-cold', name: 'Cold Brew', short: 'CLDBW', price: 75, mods: ['mg-milk','mg-syrup'], recipe: [['inv-coffee-beans',30],['inv-ice',200],['inv-cold-cup-16oz',1],['inv-cold-lid',1]] },
      { id: 'prod-croissant', cat: 'cat-food', name: 'Croissant', short: 'CRSNT', price: 55, mods: [], recipe: [['inv-croissant',1]] },
      { id: 'prod-cookie', cat: 'cat-food', name: 'Cookie Chocochip', short: 'COOKIE', price: 45, mods: [], recipe: [['inv-cookie',1]] },
      { id: 'prod-sandwich', cat: 'cat-food', name: 'Sandwich Jamon', short: 'SANDW', price: 85, mods: [], recipe: [['inv-sandwich-bread',2],['inv-ham',80],['inv-cheese',40]] },
      { id: 'prod-bag-340', cat: 'cat-retail', name: 'Cafe en Grano 340g', short: 'BAG340', price: 350, mods: [], recipe: [['inv-coffee-bag-340g',1]] },
    ];

    for (const p of products) {
      insertProd.run(p.id, p.cat, p.name, p.short, p.price, JSON.stringify(p.mods));
      for (const [invId, qty] of p.recipe) {
        insertRecipe.run(p.id, invId, qty);
      }
    }

    // Inventory Items
    const insertInv = db.prepare(`INSERT INTO inventory_items (id, name, unit, is_perishable, minimum_stock) VALUES (?,?,?,?,?)`);
    const invItems = [
      ['inv-coffee-beans', 'Cafe en grano (blend house)', 'g', 1, 1000],
      ['inv-whole-milk', 'Leche entera', 'ml', 1, 2000],
      ['inv-oat-milk', 'Leche de avena', 'ml', 1, 1000],
      ['inv-almond-milk', 'Leche de almendra', 'ml', 1, 1000],
      ['inv-coconut-milk', 'Leche de coco', 'ml', 1, 500],
      ['inv-skim-milk', 'Leche descremada', 'ml', 1, 1000],
      ['inv-cup-8oz', 'Vaso 8oz', 'pz', 0, 50],
      ['inv-cup-12oz', 'Vaso 12oz', 'pz', 0, 50],
      ['inv-cup-16oz', 'Vaso 16oz', 'pz', 0, 50],
      ['inv-lid', 'Tapa caliente', 'pz', 0, 100],
      ['inv-vanilla-syrup', 'Jarabe vainilla', 'ml', 0, 200],
      ['inv-caramel-syrup', 'Jarabe caramelo', 'ml', 0, 200],
      ['inv-hazelnut-syrup', 'Jarabe avellana', 'ml', 0, 200],
      ['inv-mocha-syrup', 'Jarabe mocha', 'ml', 0, 200],
      ['inv-croissant', 'Croissant', 'pz', 1, 5],
      ['inv-cookie', 'Cookie chocochip', 'pz', 1, 5],
      ['inv-sandwich-bread', 'Pan sandwich', 'pz', 1, 10],
      ['inv-ham', 'Jamon', 'g', 1, 200],
      ['inv-cheese', 'Queso', 'g', 1, 200],
      ['inv-filter-paper', 'Filtro de papel', 'pz', 0, 30],
      ['inv-ice', 'Hielo', 'g', 0, 5000],
      ['inv-cold-cup-16oz', 'Vaso frio 16oz', 'pz', 0, 50],
      ['inv-cold-lid', 'Tapa fria', 'pz', 0, 50],
      ['inv-coffee-bag-340g', 'Bolsa cafe 340g', 'pz', 1, 5],
    ];
    for (const i of invItems) {
      insertInv.run(...i);
    }

    // Initial Batches
    const insertBatch = db.prepare(`INSERT INTO inventory_batches (inventory_item_id, quantity_received, quantity_remaining, cost_per_unit, received_at, expires_at) VALUES (?,?,?,?,?,?)`);
    const now = new Date();
    const daysAgo = (n) => new Date(now.getTime() - n * 86400000).toISOString();
    const daysFromNow = (n) => new Date(now.getTime() + n * 86400000).toISOString();

    const batches = [
      ['inv-coffee-beans', 5000, 5000, 0.18, daysAgo(7), daysFromNow(60)],
      ['inv-coffee-beans', 5000, 5000, 0.20, daysAgo(2), daysFromNow(75)],
      ['inv-whole-milk', 6000, 6000, 0.025, daysAgo(3), daysFromNow(5)],
      ['inv-whole-milk', 6000, 6000, 0.025, daysAgo(1), daysFromNow(7)],
      ['inv-oat-milk', 3000, 3000, 0.055, daysAgo(4), daysFromNow(30)],
      ['inv-almond-milk', 2000, 2000, 0.06, daysAgo(3), daysFromNow(30)],
      ['inv-coconut-milk', 1000, 1000, 0.07, daysAgo(5), daysFromNow(30)],
      ['inv-skim-milk', 3000, 3000, 0.022, daysAgo(2), daysFromNow(5)],
      ['inv-cup-8oz', 200, 200, 1.5, daysAgo(10), null],
      ['inv-cup-12oz', 200, 200, 1.8, daysAgo(10), null],
      ['inv-cup-16oz', 200, 200, 2.2, daysAgo(10), null],
      ['inv-lid', 500, 500, 0.5, daysAgo(10), null],
      ['inv-vanilla-syrup', 750, 750, 0.12, daysAgo(15), null],
      ['inv-caramel-syrup', 750, 750, 0.12, daysAgo(15), null],
      ['inv-hazelnut-syrup', 750, 750, 0.13, daysAgo(15), null],
      ['inv-mocha-syrup', 750, 750, 0.11, daysAgo(15), null],
      ['inv-croissant', 15, 15, 18, daysAgo(1), daysFromNow(2)],
      ['inv-cookie', 20, 20, 12, daysAgo(1), daysFromNow(4)],
      ['inv-sandwich-bread', 30, 30, 5, daysAgo(1), daysFromNow(3)],
      ['inv-ham', 1000, 1000, 0.08, daysAgo(2), daysFromNow(5)],
      ['inv-cheese', 800, 800, 0.12, daysAgo(2), daysFromNow(7)],
      ['inv-filter-paper', 100, 100, 1.2, daysAgo(20), null],
      ['inv-ice', 20000, 20000, 0.002, daysAgo(0), null],
      ['inv-cold-cup-16oz', 200, 200, 2.5, daysAgo(10), null],
      ['inv-cold-lid', 200, 200, 0.6, daysAgo(10), null],
      ['inv-coffee-bag-340g', 15, 15, 150, daysAgo(3), daysFromNow(90)],
    ];
    for (const b of batches) {
      insertBatch.run(...b);
    }

    logAudit('system', 'System', 'database_seeded', null, null, { message: 'Initial seed data created' });
  });

  tx();
  console.log('Database seeded with initial data (users: admin/123456, cajero/111111, barista/222222, cocina/333333)');
  return true;
}

function getDb() { return db; }

module.exports = { initDatabase, getDb, seedIfEmpty, deductFifo, resolveRecipe, logAudit, hashPin };
