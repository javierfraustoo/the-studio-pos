-- ═══════════════════════════════════════════════════════════════════════════
-- THE STUDIO POS — Supabase PostgreSQL Schema
-- Run this in Supabase SQL Editor to create all tables, functions, and RLS
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Auth & Users ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'operador',
  operator_type TEXT,  -- 'cajero', 'barista', 'cocina' (only when role='operador')
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT,
  user_name TEXT,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Menu & Catalog ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  icon TEXT DEFAULT '',
  kds_station TEXT DEFAULT 'bar',
  sort_order INTEGER DEFAULT 0,
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL REFERENCES categories(id),
  name TEXT NOT NULL,
  short_name TEXT NOT NULL DEFAULT '',
  price NUMERIC(10,2) NOT NULL,
  modifier_group_ids JSONB DEFAULT '[]',
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS recipes (
  id SERIAL PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  inventory_item_id TEXT NOT NULL,
  quantity NUMERIC(12,4) NOT NULL
);

CREATE TABLE IF NOT EXISTS modifier_groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  selection_type TEXT NOT NULL DEFAULT 'single',
  is_required BOOLEAN DEFAULT FALSE,
  min_selections INTEGER DEFAULT 0,
  max_selections INTEGER DEFAULT 1,
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS modifiers (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES modifier_groups(id),
  name TEXT NOT NULL,
  short_name TEXT NOT NULL DEFAULT '',
  price_adjustment NUMERIC(10,2) DEFAULT 0,
  is_default BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS modifier_recipe_adjustments (
  id SERIAL PRIMARY KEY,
  modifier_id TEXT NOT NULL,
  inventory_item_id TEXT NOT NULL,
  quantity NUMERIC(12,4) NOT NULL,
  replaces_inventory_item_id TEXT
);

-- ── Inventory ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS inventory_items (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  unit TEXT NOT NULL,
  is_perishable BOOLEAN DEFAULT FALSE,
  minimum_stock NUMERIC(12,4) DEFAULT 0,
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS inventory_batches (
  id SERIAL PRIMARY KEY,
  inventory_item_id TEXT NOT NULL REFERENCES inventory_items(id),
  quantity_received NUMERIC(12,4) NOT NULL,
  quantity_remaining NUMERIC(12,4) NOT NULL,
  cost_per_unit NUMERIC(12,6) NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS inventory_movements (
  id SERIAL PRIMARY KEY,
  inventory_item_id TEXT NOT NULL,
  batch_id INTEGER REFERENCES inventory_batches(id),
  quantity NUMERIC(12,4) NOT NULL,
  movement_type TEXT NOT NULL,
  reference_id TEXT,
  cost NUMERIC(12,4) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Orders ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  order_number INTEGER NOT NULL,
  customer_name TEXT DEFAULT '',
  order_type TEXT NOT NULL,
  payment_method TEXT NOT NULL,
  subtotal NUMERIC(10,2) NOT NULL,
  total NUMERIC(10,2) NOT NULL,
  status TEXT DEFAULT 'active',
  discount NUMERIC(10,2) DEFAULT 0,
  discount_authorized_by TEXT,
  user_id TEXT,
  user_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS order_items (
  id SERIAL PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC(10,2) NOT NULL,
  modifiers_total NUMERIC(10,2) NOT NULL DEFAULT 0,
  line_total NUMERIC(10,2) NOT NULL,
  notes TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS order_item_modifiers (
  id SERIAL PRIMARY KEY,
  order_item_id INTEGER NOT NULL REFERENCES order_items(id),
  modifier_id TEXT NOT NULL,
  modifier_name TEXT NOT NULL,
  short_name TEXT NOT NULL DEFAULT '',
  price_adjustment NUMERIC(10,2) DEFAULT 0
);

-- ── KDS ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS kds_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  order_item_id INTEGER NOT NULL,
  order_number INTEGER NOT NULL,
  customer_name TEXT DEFAULT '',
  order_type TEXT NOT NULL,
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  modifiers_json JSONB DEFAULT '[]',
  notes TEXT DEFAULT '',
  station TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  routed_at TIMESTAMPTZ DEFAULT NOW(),
  ready_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  delivered_by TEXT
);

-- Migration: Add delivered_by if table already exists
ALTER TABLE kds_items ADD COLUMN IF NOT EXISTS delivered_by TEXT;

-- ── Waste ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS waste_logs (
  id TEXT PRIMARY KEY,
  item_type TEXT NOT NULL,
  item_id TEXT NOT NULL,
  item_name TEXT NOT NULL,
  quantity NUMERIC(12,4) NOT NULL,
  unit TEXT NOT NULL,
  reason TEXT NOT NULL,
  notes TEXT DEFAULT '',
  total_cost NUMERIC(12,4) NOT NULL DEFAULT 0,
  user_id TEXT,
  user_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════
-- INDEXES
-- ═══════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_item_modifiers_oi ON order_item_modifiers(order_item_id);
CREATE INDEX IF NOT EXISTS idx_kds_items_station ON kds_items(station, status);
CREATE INDEX IF NOT EXISTS idx_kds_items_order ON kds_items(order_id);
CREATE INDEX IF NOT EXISTS idx_inventory_batches_item ON inventory_batches(inventory_item_id, received_at);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_ref ON inventory_movements(reference_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_waste_logs_created ON waste_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_recipes_product ON recipes(product_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- RPC FUNCTIONS
-- ═══════════════════════════════════════════════════════════════════════════

-- FIFO Deduction (atomic inventory deduction)
CREATE OR REPLACE FUNCTION deduct_fifo(
  p_inventory_item_id TEXT,
  p_quantity NUMERIC,
  p_movement_type TEXT,
  p_reference_id TEXT
) RETURNS JSON AS $$
DECLARE
  v_remaining NUMERIC := p_quantity;
  v_total_cost NUMERIC := 0;
  v_batch RECORD;
  v_deduct NUMERIC;
  v_cost NUMERIC;
BEGIN
  FOR v_batch IN
    SELECT id, quantity_remaining, cost_per_unit
    FROM inventory_batches
    WHERE inventory_item_id = p_inventory_item_id AND quantity_remaining > 0
    ORDER BY received_at ASC
    FOR UPDATE
  LOOP
    EXIT WHEN v_remaining <= 0;
    v_deduct := LEAST(v_remaining, v_batch.quantity_remaining);

    UPDATE inventory_batches
    SET quantity_remaining = quantity_remaining - v_deduct
    WHERE id = v_batch.id;

    v_cost := v_deduct * v_batch.cost_per_unit;

    INSERT INTO inventory_movements (inventory_item_id, batch_id, quantity, movement_type, reference_id, cost)
    VALUES (p_inventory_item_id, v_batch.id, -v_deduct, p_movement_type, p_reference_id, v_cost);

    v_total_cost := v_total_cost + v_cost;
    v_remaining := v_remaining - v_deduct;
  END LOOP;

  RETURN json_build_object('totalCost', v_total_cost, 'shortfall', GREATEST(0, v_remaining));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══════════════════════════════════════════════════════════════════════════
-- ENABLE REALTIME for KDS
-- ═══════════════════════════════════════════════════════════════════════════

ALTER PUBLICATION supabase_realtime ADD TABLE kds_items;
ALTER PUBLICATION supabase_realtime ADD TABLE orders;

-- ═══════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════════════════════

-- Enable RLS on all tables but allow service_role full access
-- The Express API uses the service_role key, so it bypasses RLS.
-- For frontend direct access (Realtime), we enable public SELECT on kds_items.

ALTER TABLE kds_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read kds_items" ON kds_items FOR SELECT USING (true);
CREATE POLICY "Allow service_role all kds_items" ON kds_items FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read orders" ON orders FOR SELECT USING (true);
CREATE POLICY "Allow service_role all orders" ON orders FOR ALL USING (true) WITH CHECK (true);
