-- ============================================================================
-- THE STUDIO POS — PostgreSQL Schema v2.0
-- Iteración: Soft Deletes, Merma, KDS Routing, Analítica P&L
-- ============================================================================
-- REGLA: CERO facturación electrónica / impuestos fiscales.
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ════════════════════════════════════════════════════════════════════════════
-- FUNCIONES AUXILIARES
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. STORES
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE stores (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(120) NOT NULL,
    address     TEXT,
    phone       VARCHAR(30),
    timezone    VARCHAR(60) DEFAULT 'America/Mexico_City',
    currency    VARCHAR(3)  DEFAULT 'MXN',
    is_active   BOOLEAN     DEFAULT TRUE,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW(),
    deleted_at  TIMESTAMPTZ DEFAULT NULL          -- ◀ SOFT DELETE
);

CREATE TRIGGER trg_stores_upd BEFORE UPDATE ON stores FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ────────────────────────────────────────────────────────────────────────────
-- 2. EMPLOYEES
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE employees (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id    UUID NOT NULL REFERENCES stores(id),
    name        VARCHAR(120) NOT NULL,
    email       VARCHAR(200) UNIQUE,
    pin_hash    VARCHAR(255) NOT NULL,
    role        VARCHAR(30) DEFAULT 'barista'
                CHECK (role IN ('admin','manager','barista','cashier','kitchen')),
    is_active   BOOLEAN DEFAULT TRUE,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW(),
    deleted_at  TIMESTAMPTZ DEFAULT NULL
);

-- ────────────────────────────────────────────────────────────────────────────
-- 3. CATEGORIES  (con campo kds_station para enrutamiento)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE categories (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id      UUID NOT NULL REFERENCES stores(id),
    name          VARCHAR(100) NOT NULL,
    color         VARCHAR(7),
    icon          VARCHAR(50),
    kds_station   VARCHAR(20) DEFAULT 'bar'
                  CHECK (kds_station IN ('bar','kitchen','none')),  -- ◀ KDS routing
    display_order INT DEFAULT 0,
    is_active     BOOLEAN DEFAULT TRUE,
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    deleted_at    TIMESTAMPTZ DEFAULT NULL
);

-- ────────────────────────────────────────────────────────────────────────────
-- 4. UNITS OF MEASURE
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE units_of_measure (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name         VARCHAR(50) NOT NULL,
    abbreviation VARCHAR(10) NOT NULL,
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO units_of_measure (name, abbreviation) VALUES
    ('Gramos','g'),('Mililitros','ml'),('Unidades','pz'),
    ('Kilogramos','kg'),('Litros','L');

-- ────────────────────────────────────────────────────────────────────────────
-- 5. INVENTORY ITEMS (insumos / materia prima)  — CRUD completo
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE inventory_items (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id            UUID NOT NULL REFERENCES stores(id),
    name                VARCHAR(150) NOT NULL,
    sku                 VARCHAR(50),
    unit_id             UUID NOT NULL REFERENCES units_of_measure(id),
    cost_per_unit       DECIMAL(10,4) DEFAULT 0,      -- ◀ costo unitario actualizable
    minimum_stock       DECIMAL(10,3) DEFAULT 0,
    is_perishable       BOOLEAN DEFAULT FALSE,
    default_expiry_days INT,
    is_active           BOOLEAN DEFAULT TRUE,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ DEFAULT NULL
);

CREATE TRIGGER trg_inv_items_upd BEFORE UPDATE ON inventory_items FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ────────────────────────────────────────────────────────────────────────────
-- 6. INVENTORY BATCHES (FIFO)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE inventory_batches (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inventory_item_id   UUID NOT NULL REFERENCES inventory_items(id),
    quantity_received   DECIMAL(12,3) NOT NULL,
    quantity_remaining  DECIMAL(12,3) NOT NULL,
    cost_per_unit       DECIMAL(10,4),
    received_at         TIMESTAMPTZ DEFAULT NOW(),
    expires_at          TIMESTAMPTZ,
    supplier_name       VARCHAR(150),
    supplier_batch_ref  VARCHAR(80),
    notes               TEXT,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ DEFAULT NULL,
    CONSTRAINT chk_qty_pos CHECK (quantity_remaining >= 0)
);

CREATE INDEX idx_batches_fifo ON inventory_batches(inventory_item_id, received_at ASC)
    WHERE quantity_remaining > 0 AND deleted_at IS NULL;

CREATE INDEX idx_batches_expiry ON inventory_batches(expires_at ASC)
    WHERE quantity_remaining > 0 AND expires_at IS NOT NULL AND deleted_at IS NULL;

-- ────────────────────────────────────────────────────────────────────────────
-- 7. PRODUCTS — con soft delete y costo de receta cacheado
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE products (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id        UUID NOT NULL REFERENCES stores(id),
    category_id     UUID REFERENCES categories(id),
    name            VARCHAR(150) NOT NULL,
    short_name      VARCHAR(25),
    description     TEXT,
    price           DECIMAL(10,2) NOT NULL,
    recipe_cost     DECIMAL(10,4) DEFAULT 0,       -- ◀ costo calculado de la receta (cache)
    image_url       TEXT,
    sku             VARCHAR(50),
    display_order   INT DEFAULT 0,
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ DEFAULT NULL
);

CREATE TRIGGER trg_products_upd BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ────────────────────────────────────────────────────────────────────────────
-- 8. RECIPES / ESCANDALLOS — CRUD completo
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE recipes (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id        UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    inventory_item_id UUID NOT NULL REFERENCES inventory_items(id),
    quantity          DECIMAL(10,3) NOT NULL,
    created_at        TIMESTAMPTZ DEFAULT NOW(),
    updated_at        TIMESTAMPTZ DEFAULT NOW(),
    deleted_at        TIMESTAMPTZ DEFAULT NULL,
    UNIQUE (product_id, inventory_item_id)
);

-- ────────────────────────────────────────────────────────────────────────────
-- 9. MODIFIER GROUPS + MODIFIERS
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE modifier_groups (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id        UUID NOT NULL REFERENCES stores(id),
    name            VARCHAR(100) NOT NULL,
    selection_type  VARCHAR(10) DEFAULT 'single' CHECK (selection_type IN ('single','multiple')),
    is_required     BOOLEAN DEFAULT FALSE,
    min_selections  INT DEFAULT 0,
    max_selections  INT DEFAULT 1,
    display_order   INT DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ DEFAULT NULL
);

CREATE TABLE modifiers (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id         UUID NOT NULL REFERENCES modifier_groups(id) ON DELETE CASCADE,
    name             VARCHAR(100) NOT NULL,
    short_name       VARCHAR(15),
    price_adjustment DECIMAL(10,2) DEFAULT 0.00,
    is_default       BOOLEAN DEFAULT FALSE,
    display_order    INT DEFAULT 0,
    is_active        BOOLEAN DEFAULT TRUE,
    created_at       TIMESTAMPTZ DEFAULT NOW(),
    deleted_at       TIMESTAMPTZ DEFAULT NULL
);

CREATE TABLE product_modifier_groups (
    product_id        UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    modifier_group_id UUID NOT NULL REFERENCES modifier_groups(id) ON DELETE CASCADE,
    PRIMARY KEY (product_id, modifier_group_id)
);

CREATE TABLE modifier_recipe_adjustments (
    id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    modifier_id                UUID NOT NULL REFERENCES modifiers(id) ON DELETE CASCADE,
    replaces_inventory_item_id UUID REFERENCES inventory_items(id),
    inventory_item_id          UUID NOT NULL REFERENCES inventory_items(id),
    quantity                   DECIMAL(10,3) NOT NULL,
    deleted_at                 TIMESTAMPTZ DEFAULT NULL
);

-- ────────────────────────────────────────────────────────────────────────────
-- 10. ORDERS — con soft delete
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE orders (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id        UUID NOT NULL REFERENCES stores(id),
    order_number    INT NOT NULL,
    status          VARCHAR(20) DEFAULT 'pending'
                    CHECK (status IN ('pending','in_progress','ready','completed','cancelled')),
    order_type      VARCHAR(15) DEFAULT 'dine_in'
                    CHECK (order_type IN ('dine_in','to_go','pickup')),
    subtotal        DECIMAL(10,2) NOT NULL,
    discount_amount DECIMAL(10,2) DEFAULT 0.00,
    total           DECIMAL(10,2) NOT NULL,
    customer_name   VARCHAR(100),
    notes           TEXT,
    created_by      UUID REFERENCES employees(id),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    completed_at    TIMESTAMPTZ,
    deleted_at      TIMESTAMPTZ DEFAULT NULL
);

CREATE INDEX idx_orders_store_date ON orders(store_id, created_at DESC) WHERE deleted_at IS NULL;

-- ────────────────────────────────────────────────────────────────────────────
-- 11. ORDER ITEMS — con campo notes individual
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE order_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id        UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id      UUID NOT NULL REFERENCES products(id),
    product_name    VARCHAR(150) NOT NULL,
    quantity        INT NOT NULL DEFAULT 1,
    unit_price      DECIMAL(10,2) NOT NULL,
    modifiers_total DECIMAL(10,2) DEFAULT 0.00,
    subtotal        DECIMAL(10,2) NOT NULL,
    recipe_cost     DECIMAL(10,4) DEFAULT 0,       -- ◀ costo snapshot para P&L
    notes           TEXT,                           -- ◀ notas individuales por item
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE order_item_modifiers (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_item_id    UUID NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
    modifier_id      UUID REFERENCES modifiers(id),
    modifier_name    VARCHAR(100) NOT NULL,
    price_adjustment DECIMAL(10,2) DEFAULT 0.00
);

-- ────────────────────────────────────────────────────────────────────────────
-- 12. KDS STATIONS — Configuración por tienda
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE kds_stations (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id    UUID NOT NULL REFERENCES stores(id),
    name        VARCHAR(60) NOT NULL,              -- "KDS Barra", "KDS Cocina"
    slug        VARCHAR(20) NOT NULL,              -- "bar", "kitchen"
    is_active   BOOLEAN DEFAULT TRUE,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────────────────────────
-- 13. KDS ORDER ITEMS — Items enrutados a cada estación
--     Es la tabla pivote entre order_items y kds_stations.
--     Cada item de la orden se enruta a la estación según la categoría del producto.
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE kds_order_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id        UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    order_item_id   UUID NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
    kds_station_id  UUID NOT NULL REFERENCES kds_stations(id),
    status          VARCHAR(20) DEFAULT 'pending'
                    CHECK (status IN ('pending','in_progress','ready','delivered')),
    routed_at       TIMESTAMPTZ DEFAULT NOW(),      -- ◀ timestamp para calcular SLA
    started_at      TIMESTAMPTZ,
    ready_at        TIMESTAMPTZ,
    delivered_at    TIMESTAMPTZ
);

CREATE INDEX idx_kds_items_station ON kds_order_items(kds_station_id, status)
    WHERE status NOT IN ('delivered');

CREATE INDEX idx_kds_items_order ON kds_order_items(order_id);

-- ────────────────────────────────────────────────────────────────────────────
-- 14. INVENTORY MOVEMENTS (audit trail)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE inventory_movements (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inventory_item_id UUID NOT NULL REFERENCES inventory_items(id),
    batch_id          UUID REFERENCES inventory_batches(id),
    movement_type     VARCHAR(15) NOT NULL
                      CHECK (movement_type IN ('purchase','sale','waste','adjustment','transfer')),
    quantity          DECIMAL(12,3) NOT NULL,
    reference_type    VARCHAR(20),
    reference_id      UUID,
    notes             TEXT,
    performed_by      UUID REFERENCES employees(id),
    created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_movements_item ON inventory_movements(inventory_item_id, created_at DESC);

-- ────────────────────────────────────────────────────────────────────────────
-- 15. WASTE LOG — Registro de merma dedicado
--     Categoriza las razones de merma para análisis.
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE waste_logs (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id          UUID NOT NULL REFERENCES stores(id),
    inventory_item_id UUID REFERENCES inventory_items(id),     -- merma de insumo
    product_id        UUID REFERENCES products(id),            -- merma de producto terminado
    quantity          DECIMAL(10,3) NOT NULL,
    unit_cost         DECIMAL(10,4) DEFAULT 0,                 -- costo al momento de la merma
    total_cost        DECIMAL(10,4) GENERATED ALWAYS AS (quantity * unit_cost) STORED,
    reason            VARCHAR(30) NOT NULL
                      CHECK (reason IN (
                        'dropped',          -- se cayó / accidente
                        'expired',          -- caducado
                        'wrong_order',      -- orden equivocada
                        'quality',          -- no pasó control de calidad
                        'overproduction',   -- sobreproducción
                        'other'
                      )),
    notes             TEXT,
    performed_by      UUID REFERENCES employees(id),
    created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_waste_store_date ON waste_logs(store_id, created_at DESC);

-- ────────────────────────────────────────────────────────────────────────────
-- 16. PAYMENTS
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE payments (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id       UUID NOT NULL REFERENCES orders(id),
    payment_method VARCHAR(20) NOT NULL
                   CHECK (payment_method IN ('cash','card','stripe','adyen','other')),
    amount         DECIMAL(10,2) NOT NULL,
    reference      VARCHAR(200),
    status         VARCHAR(20) DEFAULT 'completed'
                   CHECK (status IN ('pending','completed','refunded','failed')),
    created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────────────────────────
-- 17. CASH REGISTER SESSIONS
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE cash_register_sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id        UUID NOT NULL REFERENCES stores(id),
    opened_by       UUID NOT NULL REFERENCES employees(id),
    closed_by       UUID REFERENCES employees(id),
    opening_amount  DECIMAL(10,2) NOT NULL,
    closing_amount  DECIMAL(10,2),
    expected_amount DECIMAL(10,2),
    difference      DECIMAL(10,2),
    opened_at       TIMESTAMPTZ DEFAULT NOW(),
    closed_at       TIMESTAMPTZ,
    notes           TEXT
);

-- ────────────────────────────────────────────────────────────────────────────
-- 18. PRINT JOBS — SOLO recibos de cliente (ya no comandas de barra)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE print_jobs (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id      UUID NOT NULL REFERENCES stores(id),
    printer_name  VARCHAR(60) NOT NULL DEFAULT 'receipt_printer',
    job_type      VARCHAR(20) NOT NULL DEFAULT 'receipt'
                  CHECK (job_type IN ('receipt')),               -- ◀ solo recibos
    payload       JSONB NOT NULL,
    status        VARCHAR(20) DEFAULT 'pending'
                  CHECK (status IN ('pending','printing','completed','failed')),
    attempts      INT DEFAULT 0,
    max_attempts  INT DEFAULT 3,
    error_message TEXT,
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    processed_at  TIMESTAMPTZ
);

CREATE TABLE printers (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id    UUID NOT NULL REFERENCES stores(id),
    name        VARCHAR(60) NOT NULL,
    ip_address  VARCHAR(45) NOT NULL,
    port        INT DEFAULT 9100,
    model       VARCHAR(80),
    paper_width INT DEFAULT 80,
    is_active   BOOLEAN DEFAULT TRUE,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ════════════════════════════════════════════════════════════════════════════
-- VISTAS ANALÍTICAS (P&L)
-- ════════════════════════════════════════════════════════════════════════════

-- ── V1: Costo actual de receta por producto ─────────────────────────────────
CREATE OR REPLACE VIEW v_product_recipe_cost AS
SELECT
    p.id                AS product_id,
    p.store_id,
    p.name              AS product_name,
    p.price             AS sale_price,
    COALESCE(SUM(r.quantity * ii.cost_per_unit), 0) AS recipe_cost,
    p.price - COALESCE(SUM(r.quantity * ii.cost_per_unit), 0) AS gross_margin,
    CASE WHEN p.price > 0
         THEN ROUND(((p.price - COALESCE(SUM(r.quantity * ii.cost_per_unit), 0)) / p.price) * 100, 2)
         ELSE 0
    END AS margin_pct
FROM products p
LEFT JOIN recipes r ON r.product_id = p.id AND r.deleted_at IS NULL
LEFT JOIN inventory_items ii ON ii.id = r.inventory_item_id AND ii.deleted_at IS NULL
WHERE p.deleted_at IS NULL
GROUP BY p.id, p.store_id, p.name, p.price;

-- ── V2: Stock actual con alertas ────────────────────────────────────────────
CREATE OR REPLACE VIEW v_current_stock AS
SELECT
    ii.id AS inventory_item_id, ii.store_id, ii.name,
    u.abbreviation AS unit, ii.cost_per_unit,
    COALESCE(SUM(ib.quantity_remaining), 0) AS total_stock,
    ii.minimum_stock,
    CASE WHEN COALESCE(SUM(ib.quantity_remaining), 0) <= ii.minimum_stock THEN TRUE ELSE FALSE END AS is_low_stock,
    MIN(ib.expires_at) FILTER (WHERE ib.quantity_remaining > 0) AS nearest_expiry
FROM inventory_items ii
JOIN units_of_measure u ON u.id = ii.unit_id
LEFT JOIN inventory_batches ib ON ib.inventory_item_id = ii.id
    AND ib.quantity_remaining > 0 AND ib.deleted_at IS NULL
WHERE ii.is_active = TRUE AND ii.deleted_at IS NULL
GROUP BY ii.id, ii.store_id, ii.name, u.abbreviation, ii.cost_per_unit, ii.minimum_stock;

-- ── V3: Lotes próximos a caducar ────────────────────────────────────────────
CREATE OR REPLACE VIEW v_expiring_batches AS
SELECT
    ib.id AS batch_id, ii.store_id, ii.name AS item_name,
    ib.quantity_remaining, u.abbreviation AS unit,
    ib.expires_at, ib.expires_at - NOW() AS time_until_expiry
FROM inventory_batches ib
JOIN inventory_items ii ON ii.id = ib.inventory_item_id
JOIN units_of_measure u ON u.id = ii.unit_id
WHERE ib.quantity_remaining > 0 AND ib.deleted_at IS NULL
  AND ib.expires_at IS NOT NULL
  AND ib.expires_at <= NOW() + INTERVAL '7 days'
ORDER BY ib.expires_at ASC;

-- ── V4: Resumen de merma por período ────────────────────────────────────────
CREATE OR REPLACE VIEW v_waste_summary AS
SELECT
    w.store_id,
    DATE(w.created_at) AS waste_date,
    w.reason,
    COUNT(*) AS incidents,
    SUM(w.total_cost) AS total_loss,
    COALESCE(ii.name, p.name) AS item_name
FROM waste_logs w
LEFT JOIN inventory_items ii ON ii.id = w.inventory_item_id
LEFT JOIN products p ON p.id = w.product_id
GROUP BY w.store_id, DATE(w.created_at), w.reason, ii.name, p.name;

COMMIT;
