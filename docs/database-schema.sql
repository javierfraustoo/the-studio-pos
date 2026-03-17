-- ============================================================================
-- THE STUDIO POS — PostgreSQL Schema v1.0 (MVP)
-- Specialty Coffee Shop POS with FIFO Inventory & Complex Modifiers
-- ============================================================================
-- NOTA: Este esquema NO incluye facturación electrónica ni comprobantes fiscales.
-- ============================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- EXTENSIONS
-- ────────────────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()

-- ────────────────────────────────────────────────────────────────────────────
-- 1. STORES (multi-sucursal)
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
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────────────────────────
-- 2. EMPLOYEES / USERS
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE employees (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id    UUID NOT NULL REFERENCES stores(id),
    name        VARCHAR(120) NOT NULL,
    email       VARCHAR(200) UNIQUE,
    pin_hash    VARCHAR(255) NOT NULL,          -- PIN numérico hasheado para login rápido
    role        VARCHAR(30)  DEFAULT 'barista', -- 'admin', 'manager', 'barista', 'cashier'
    is_active   BOOLEAN      DEFAULT TRUE,
    created_at  TIMESTAMPTZ  DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────────────────────────
-- 3. CATEGORIES
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE categories (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id        UUID NOT NULL REFERENCES stores(id),
    name            VARCHAR(100) NOT NULL,
    color           VARCHAR(7),      -- Hex (#3B82F6) para el UI
    icon            VARCHAR(50),     -- nombre del icono en el frontend
    display_order   INT DEFAULT 0,
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_categories_store ON categories(store_id, display_order);

-- ────────────────────────────────────────────────────────────────────────────
-- 4. PRODUCTS (Menú)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE products (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id        UUID NOT NULL REFERENCES stores(id),
    category_id     UUID REFERENCES categories(id),
    name            VARCHAR(150) NOT NULL,
    short_name      VARCHAR(25),              -- Para impresión en ticket (max ancho)
    description     TEXT,
    price           DECIMAL(10,2) NOT NULL,
    image_url       TEXT,                     -- S3 URL
    sku             VARCHAR(50),
    display_order   INT DEFAULT 0,
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_products_store_cat ON products(store_id, category_id, display_order);

-- ────────────────────────────────────────────────────────────────────────────
-- 5. MODIFIER GROUPS (Tipo de Leche, Temperatura, Shots Extra, Jarabes)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE modifier_groups (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id        UUID NOT NULL REFERENCES stores(id),
    name            VARCHAR(100) NOT NULL,     -- "Tipo de Leche", "Temperatura"
    selection_type  VARCHAR(10) DEFAULT 'single' CHECK (selection_type IN ('single', 'multiple')),
    is_required     BOOLEAN DEFAULT FALSE,
    min_selections  INT DEFAULT 0,
    max_selections  INT DEFAULT 1,
    display_order   INT DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────────────────────────
-- 6. MODIFIERS (las opciones dentro de cada grupo)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE modifiers (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id         UUID NOT NULL REFERENCES modifier_groups(id) ON DELETE CASCADE,
    name             VARCHAR(100) NOT NULL,     -- "Leche de Avena", "Extra Hot"
    short_name       VARCHAR(15),               -- Para ticket: "AVENA", "XHOT"
    price_adjustment DECIMAL(10,2) DEFAULT 0.00,
    is_default       BOOLEAN DEFAULT FALSE,
    display_order    INT DEFAULT 0,
    is_active        BOOLEAN DEFAULT TRUE,
    created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_modifiers_group ON modifiers(group_id, display_order);

-- ────────────────────────────────────────────────────────────────────────────
-- 7. PRODUCT ↔ MODIFIER GROUP (relación N:M)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE product_modifier_groups (
    product_id        UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    modifier_group_id UUID NOT NULL REFERENCES modifier_groups(id) ON DELETE CASCADE,
    PRIMARY KEY (product_id, modifier_group_id)
);

-- ────────────────────────────────────────────────────────────────────────────
-- 8. UNITS OF MEASURE
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE units_of_measure (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name         VARCHAR(50) NOT NULL,   -- "Gramos", "Mililitros", "Unidades"
    abbreviation VARCHAR(10) NOT NULL,   -- "g", "ml", "pz"
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Seed inicial
INSERT INTO units_of_measure (name, abbreviation) VALUES
    ('Gramos', 'g'),
    ('Mililitros', 'ml'),
    ('Unidades', 'pz'),
    ('Kilogramos', 'kg'),
    ('Litros', 'L');

-- ────────────────────────────────────────────────────────────────────────────
-- 9. INVENTORY ITEMS (materia prima: café, leche, vasos, tapas…)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE inventory_items (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id            UUID NOT NULL REFERENCES stores(id),
    name                VARCHAR(150) NOT NULL,
    sku                 VARCHAR(50),
    unit_id             UUID NOT NULL REFERENCES units_of_measure(id),
    minimum_stock       DECIMAL(10,3) DEFAULT 0,   -- alerta de reorden
    is_perishable       BOOLEAN DEFAULT FALSE,
    default_expiry_days INT,                        -- días default de caducidad
    is_active           BOOLEAN DEFAULT TRUE,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_inventory_store ON inventory_items(store_id);

-- ────────────────────────────────────────────────────────────────────────────
-- 10. INVENTORY BATCHES — Corazón del sistema FIFO
--     Cada lote tiene fecha de recepción y caducidad.
--     Al descontar, siempre se consume del lote más antiguo primero.
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE inventory_batches (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inventory_item_id   UUID NOT NULL REFERENCES inventory_items(id),
    quantity_received   DECIMAL(12,3) NOT NULL,
    quantity_remaining  DECIMAL(12,3) NOT NULL,
    cost_per_unit       DECIMAL(10,4),             -- costo unitario para cálculo de COGS
    received_at         TIMESTAMPTZ DEFAULT NOW(),  -- ← clave para FIFO sort
    expires_at          TIMESTAMPTZ,                -- NULL si no es perecedero
    supplier_name       VARCHAR(150),
    supplier_batch_ref  VARCHAR(80),
    notes               TEXT,
    created_at          TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT chk_qty_remaining_positive CHECK (quantity_remaining >= 0)
);

-- Índice FIFO: lotes con stock > 0 ordenados por fecha de recepción
CREATE INDEX idx_batches_fifo
    ON inventory_batches (inventory_item_id, received_at ASC)
    WHERE quantity_remaining > 0;

-- Índice para alertas de caducidad próxima
CREATE INDEX idx_batches_expiry
    ON inventory_batches (expires_at ASC)
    WHERE quantity_remaining > 0 AND expires_at IS NOT NULL;

-- ────────────────────────────────────────────────────────────────────────────
-- 11. RECIPES / ESCANDALLOS
--     Definen cuánto de cada materia prima consume un producto.
--     Ej: "Latte 12oz" → 18g café, 250ml leche, 1pz vaso12oz, 1pz tapa
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE recipes (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id        UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    inventory_item_id UUID NOT NULL REFERENCES inventory_items(id),
    quantity          DECIMAL(10,3) NOT NULL,   -- cantidad a descontar

    UNIQUE (product_id, inventory_item_id)
);

-- ────────────────────────────────────────────────────────────────────────────
-- 12. MODIFIER RECIPE ADJUSTMENTS
--     Cuando un modificador altera la receta base.
--     Ej: Modifier "Leche de Avena" → reemplaza 250ml leche_entera
--         por 250ml leche_avena.
--     Ej: Modifier "Shot Extra" → agrega 18g café (sin reemplazo).
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE modifier_recipe_adjustments (
    id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    modifier_id                UUID NOT NULL REFERENCES modifiers(id) ON DELETE CASCADE,
    replaces_inventory_item_id UUID REFERENCES inventory_items(id), -- NULL = solo agrega
    inventory_item_id          UUID NOT NULL REFERENCES inventory_items(id),
    quantity                   DECIMAL(10,3) NOT NULL
);

-- ────────────────────────────────────────────────────────────────────────────
-- 13. ORDERS
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE orders (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id        UUID NOT NULL REFERENCES stores(id),
    order_number    INT NOT NULL,                  -- secuencial por tienda
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
    completed_at    TIMESTAMPTZ
);

-- Secuencia diaria (se resetea lógicamente en el app layer por turno)
CREATE INDEX idx_orders_store_date ON orders(store_id, created_at DESC);
CREATE INDEX idx_orders_status ON orders(store_id, status) WHERE status NOT IN ('completed','cancelled');

-- ────────────────────────────────────────────────────────────────────────────
-- 14. ORDER ITEMS
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE order_items (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id      UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id    UUID NOT NULL REFERENCES products(id),
    product_name  VARCHAR(150) NOT NULL,      -- snapshot del nombre al momento de la venta
    quantity      INT NOT NULL DEFAULT 1,
    unit_price    DECIMAL(10,2) NOT NULL,
    modifiers_total DECIMAL(10,2) DEFAULT 0.00, -- suma de price_adjustments de modificadores
    subtotal      DECIMAL(10,2) NOT NULL,     -- (unit_price + modifiers_total) * quantity
    notes         TEXT,
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────────────────────────
-- 15. ORDER ITEM MODIFIERS (snapshot de modificadores aplicados)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE order_item_modifiers (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_item_id    UUID NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
    modifier_id      UUID REFERENCES modifiers(id),
    modifier_name    VARCHAR(100) NOT NULL,     -- snapshot
    price_adjustment DECIMAL(10,2) DEFAULT 0.00
);

-- ────────────────────────────────────────────────────────────────────────────
-- 16. INVENTORY MOVEMENTS (audit trail completo)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE inventory_movements (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inventory_item_id UUID NOT NULL REFERENCES inventory_items(id),
    batch_id          UUID REFERENCES inventory_batches(id),
    movement_type     VARCHAR(15) NOT NULL
                      CHECK (movement_type IN ('purchase','sale','waste','adjustment','transfer')),
    quantity          DECIMAL(12,3) NOT NULL,   -- positivo = entrada, negativo = salida
    reference_type    VARCHAR(20),              -- 'order', 'manual', 'waste_log'
    reference_id      UUID,                     -- FK lógica al order o registro origen
    notes             TEXT,
    performed_by      UUID REFERENCES employees(id),
    created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_movements_item ON inventory_movements(inventory_item_id, created_at DESC);
CREATE INDEX idx_movements_ref  ON inventory_movements(reference_type, reference_id);

-- ────────────────────────────────────────────────────────────────────────────
-- 17. PAYMENTS
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE payments (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id       UUID NOT NULL REFERENCES orders(id),
    payment_method VARCHAR(20) NOT NULL
                   CHECK (payment_method IN ('cash','card','stripe','adyen','other')),
    amount         DECIMAL(10,2) NOT NULL,
    reference      VARCHAR(200),    -- Stripe payment_intent_id, Adyen pspReference, etc.
    status         VARCHAR(20) DEFAULT 'completed'
                   CHECK (status IN ('pending','completed','refunded','failed')),
    created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_payments_order ON payments(order_id);

-- ────────────────────────────────────────────────────────────────────────────
-- 18. CASH REGISTER SESSIONS (cortes de caja)
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
-- 19. PRINT JOBS QUEUE (cola de impresión ESC/POS)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE print_jobs (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id      UUID NOT NULL REFERENCES stores(id),
    printer_name  VARCHAR(60) NOT NULL,         -- "bar_printer", "kitchen_printer", "receipt_printer"
    job_type      VARCHAR(20) NOT NULL
                  CHECK (job_type IN ('receipt','bar_order','kitchen_order')),
    payload       JSONB NOT NULL,               -- datos serializados de la orden
    status        VARCHAR(20) DEFAULT 'pending'
                  CHECK (status IN ('pending','printing','completed','failed')),
    attempts      INT DEFAULT 0,
    max_attempts  INT DEFAULT 3,
    error_message TEXT,
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    processed_at  TIMESTAMPTZ
);

CREATE INDEX idx_print_jobs_pending
    ON print_jobs (store_id, created_at ASC)
    WHERE status = 'pending';

-- ────────────────────────────────────────────────────────────────────────────
-- 20. PRINTERS (configuración de impresoras por tienda)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE printers (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id    UUID NOT NULL REFERENCES stores(id),
    name        VARCHAR(60) NOT NULL,           -- "bar_printer"
    ip_address  VARCHAR(45) NOT NULL,           -- IPv4/IPv6
    port        INT DEFAULT 9100,               -- Puerto TCP estándar ESC/POS
    model       VARCHAR(80),                    -- "EPSON TM-m30II", "Star TSP143IV"
    paper_width INT DEFAULT 80,                 -- mm (58 o 80)
    is_active   BOOLEAN DEFAULT TRUE,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ════════════════════════════════════════════════════════════════════════════
-- FUNCIÓN HELPER: actualizar updated_at automáticamente
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_stores_updated    BEFORE UPDATE ON stores          FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER trg_employees_updated BEFORE UPDATE ON employees       FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER trg_products_updated  BEFORE UPDATE ON products        FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER trg_inventory_updated BEFORE UPDATE ON inventory_items FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ════════════════════════════════════════════════════════════════════════════
-- VISTA: Stock actual por item (suma de todos los batches con remaining > 0)
-- ════════════════════════════════════════════════════════════════════════════
CREATE VIEW v_current_stock AS
SELECT
    ii.id               AS inventory_item_id,
    ii.store_id,
    ii.name,
    u.abbreviation      AS unit,
    COALESCE(SUM(ib.quantity_remaining), 0) AS total_stock,
    ii.minimum_stock,
    CASE
        WHEN COALESCE(SUM(ib.quantity_remaining), 0) <= ii.minimum_stock THEN TRUE
        ELSE FALSE
    END AS is_low_stock,
    MIN(ib.expires_at) FILTER (WHERE ib.quantity_remaining > 0) AS nearest_expiry
FROM inventory_items ii
JOIN units_of_measure u ON u.id = ii.unit_id
LEFT JOIN inventory_batches ib ON ib.inventory_item_id = ii.id AND ib.quantity_remaining > 0
WHERE ii.is_active = TRUE
GROUP BY ii.id, ii.store_id, ii.name, u.abbreviation, ii.minimum_stock;

-- ════════════════════════════════════════════════════════════════════════════
-- VISTA: Lotes próximos a caducar (próximos 7 días)
-- ════════════════════════════════════════════════════════════════════════════
CREATE VIEW v_expiring_batches AS
SELECT
    ib.id AS batch_id,
    ii.store_id,
    ii.name AS item_name,
    ib.quantity_remaining,
    u.abbreviation AS unit,
    ib.expires_at,
    ib.expires_at - NOW() AS time_until_expiry
FROM inventory_batches ib
JOIN inventory_items ii ON ii.id = ib.inventory_item_id
JOIN units_of_measure u ON u.id = ii.unit_id
WHERE ib.quantity_remaining > 0
  AND ib.expires_at IS NOT NULL
  AND ib.expires_at <= NOW() + INTERVAL '7 days'
ORDER BY ib.expires_at ASC;

COMMIT;
