-- ============================================================================
-- THE STUDIO POS — Queries Analíticos P&L
-- ============================================================================

-- ═══════════════════════════════════════════════════════════════════════════
-- MÉTRICA 1: MARGEN DE RENTABILIDAD POR PRODUCTO
--   Calcula: Precio de Venta - Costo de Receta (basado en costo actual de insumos)
--   Incluye: margen bruto en $ y en %
-- ═══════════════════════════════════════════════════════════════════════════

-- A) Vista rápida: Rentabilidad de todo el menú activo
SELECT
    p.id,
    p.name                                          AS producto,
    p.price                                         AS precio_venta,
    COALESCE(SUM(r.quantity * ii.cost_per_unit), 0) AS costo_receta,
    p.price - COALESCE(SUM(r.quantity * ii.cost_per_unit), 0)
                                                    AS margen_bruto,
    ROUND(
      ((p.price - COALESCE(SUM(r.quantity * ii.cost_per_unit), 0)) / NULLIF(p.price, 0)) * 100,
      1
    )                                               AS margen_pct
FROM products p
LEFT JOIN recipes r       ON r.product_id = p.id AND r.deleted_at IS NULL
LEFT JOIN inventory_items ii ON ii.id = r.inventory_item_id
WHERE p.deleted_at IS NULL AND p.is_active = TRUE
GROUP BY p.id, p.name, p.price
ORDER BY margen_pct DESC;

-- B) Desglose de receta de un producto específico (ej: Latte)
SELECT
    p.name                      AS producto,
    ii.name                     AS insumo,
    r.quantity                  AS cantidad_por_unidad,
    u.abbreviation              AS unidad,
    ii.cost_per_unit            AS costo_unitario_insumo,
    r.quantity * ii.cost_per_unit AS costo_linea
FROM recipes r
JOIN products p        ON p.id = r.product_id
JOIN inventory_items ii ON ii.id = r.inventory_item_id
JOIN units_of_measure u ON u.id = ii.unit_id
WHERE p.name = 'Latte' AND r.deleted_at IS NULL
ORDER BY costo_linea DESC;


-- ═══════════════════════════════════════════════════════════════════════════
-- MÉTRICA 2: PRODUCTOS MÁS VENDIDOS (TOP SELLERS)
--   Filtrable por ventanas de tiempo (horas del día)
-- ═══════════════════════════════════════════════════════════════════════════

-- A) Top 10 productos — Últimos 30 días
SELECT
    oi.product_name,
    SUM(oi.quantity)                AS unidades_vendidas,
    SUM(oi.subtotal)                AS ingreso_total,
    SUM(oi.quantity * oi.recipe_cost) AS costo_total,
    SUM(oi.subtotal) - SUM(oi.quantity * oi.recipe_cost) AS ganancia_bruta,
    COUNT(DISTINCT o.id)            AS num_ordenes
FROM order_items oi
JOIN orders o ON o.id = oi.order_id
WHERE o.deleted_at IS NULL
  AND o.status IN ('completed', 'ready')
  AND o.created_at >= NOW() - INTERVAL '30 days'
GROUP BY oi.product_name
ORDER BY unidades_vendidas DESC
LIMIT 10;

-- B) Top sellers por ventana de tiempo (MAÑANA: 7-11 AM vs TARDE: 4-8 PM)
--    Usa EXTRACT(HOUR ...) para filtrar por hora local
SELECT
    oi.product_name,
    CASE
        WHEN EXTRACT(HOUR FROM o.created_at AT TIME ZONE 'America/Mexico_City')
             BETWEEN 7 AND 10  THEN 'Mañana (7-11 AM)'
        WHEN EXTRACT(HOUR FROM o.created_at AT TIME ZONE 'America/Mexico_City')
             BETWEEN 11 AND 15 THEN 'Mediodía (11 AM-4 PM)'
        WHEN EXTRACT(HOUR FROM o.created_at AT TIME ZONE 'America/Mexico_City')
             BETWEEN 16 AND 19 THEN 'Tarde (4-8 PM)'
        ELSE 'Otros'
    END AS ventana_horaria,
    SUM(oi.quantity)   AS unidades,
    SUM(oi.subtotal)   AS ingreso
FROM order_items oi
JOIN orders o ON o.id = oi.order_id
WHERE o.deleted_at IS NULL
  AND o.status IN ('completed', 'ready')
  AND o.created_at >= NOW() - INTERVAL '30 days'
GROUP BY oi.product_name, ventana_horaria
ORDER BY ventana_horaria, unidades DESC;

-- C) Ventas por hora del día (heat map data)
SELECT
    EXTRACT(HOUR FROM o.created_at AT TIME ZONE 'America/Mexico_City') AS hora,
    COUNT(DISTINCT o.id)  AS num_ordenes,
    SUM(o.total)          AS ingreso_total,
    ROUND(AVG(o.total),2) AS ticket_promedio
FROM orders o
WHERE o.deleted_at IS NULL
  AND o.status IN ('completed','ready')
  AND o.created_at >= NOW() - INTERVAL '30 days'
GROUP BY hora
ORDER BY hora;


-- ═══════════════════════════════════════════════════════════════════════════
-- MÉTRICA 3: ANÁLISIS DE MERMA (WASTE)
-- ═══════════════════════════════════════════════════════════════════════════

-- A) Merma total por razón — últimos 30 días
SELECT
    w.reason,
    COUNT(*)           AS incidencias,
    SUM(w.total_cost)  AS costo_total_perdido
FROM waste_logs w
WHERE w.created_at >= NOW() - INTERVAL '30 days'
GROUP BY w.reason
ORDER BY costo_total_perdido DESC;

-- B) Merma diaria (para gráfica de tendencia)
SELECT
    DATE(w.created_at) AS fecha,
    COUNT(*)           AS incidencias,
    SUM(w.total_cost)  AS perdida_dia
FROM waste_logs w
WHERE w.created_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE(w.created_at)
ORDER BY fecha;


-- ═══════════════════════════════════════════════════════════════════════════
-- MÉTRICA 4: KDS — TIEMPOS PROMEDIO DE PREPARACIÓN
-- ═══════════════════════════════════════════════════════════════════════════

SELECT
    ks.name AS estacion,
    COUNT(*) AS items_preparados,
    ROUND(AVG(EXTRACT(EPOCH FROM (ki.delivered_at - ki.routed_at)) / 60)::numeric, 1)
        AS promedio_minutos,
    ROUND(MAX(EXTRACT(EPOCH FROM (ki.delivered_at - ki.routed_at)) / 60)::numeric, 1)
        AS max_minutos,
    COUNT(*) FILTER (
        WHERE EXTRACT(EPOCH FROM (ki.delivered_at - ki.routed_at)) > 600
    ) AS items_over_10min
FROM kds_order_items ki
JOIN kds_stations ks ON ks.id = ki.kds_station_id
WHERE ki.delivered_at IS NOT NULL
  AND ki.routed_at >= NOW() - INTERVAL '7 days'
GROUP BY ks.name;
