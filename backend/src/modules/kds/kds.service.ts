import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

// ─── Tipos ──────────────────────────────────────────────────────────────────

export interface KdsItem {
  id: string;               // kds_order_items.id
  orderId: string;
  orderItemId: string;
  orderNumber: number;
  customerName: string | null;
  orderType: string;
  productName: string;
  quantity: number;
  modifiers: string[];
  notes: string | null;
  station: string;           // "bar" | "kitchen"
  status: string;
  routedAt: Date;
  startedAt: Date | null;
  readyAt: Date | null;
  deliveredAt: Date | null;
  elapsedSeconds: number;    // segundos desde que se enrutó
}

// ─────────────────────────────────────────────────────────────────────────────
// KDS SERVICE — Lógica de enrutamiento y gestión de estados
// ─────────────────────────────────────────────────────────────────────────────
@Injectable()
export class KdsService {
  private readonly logger = new Logger(KdsService.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. ENRUTAR ITEMS DE UNA ORDEN A LAS ESTACIONES KDS
  // ═══════════════════════════════════════════════════════════════════════════
  async routeItems(
    storeId: string,
    orderId: string,
    items: Array<{
      orderItemId: string;
      productName: string;
      quantity: number;
      categoryKdsStation: string;
      modifiers: string[];
      notes?: string;
    }>,
  ): Promise<KdsItem[]> {
    const routed: KdsItem[] = [];

    for (const item of items) {
      // Items con kds_station = 'none' (ej: retail) no se enrutan
      if (item.categoryKdsStation === 'none') continue;

      // Buscar la estación KDS
      const stations = await this.dataSource.query(
        `SELECT id FROM kds_stations
         WHERE store_id = $1 AND slug = $2 AND is_active = TRUE
         LIMIT 1`,
        [storeId, item.categoryKdsStation],
      );

      if (stations.length === 0) {
        this.logger.warn(
          `KDS station '${item.categoryKdsStation}' not found for store ${storeId}`,
        );
        continue;
      }

      const [kdsItem] = await this.dataSource.query(
        `INSERT INTO kds_order_items
           (order_id, order_item_id, kds_station_id, status, routed_at)
         VALUES ($1, $2, $3, 'pending', NOW())
         RETURNING id, routed_at`,
        [orderId, item.orderItemId, stations[0].id],
      );

      routed.push({
        id: kdsItem.id,
        orderId,
        orderItemId: item.orderItemId,
        orderNumber: 0, // será llenado por el caller
        customerName: null,
        orderType: '',
        productName: item.productName,
        quantity: item.quantity,
        modifiers: item.modifiers,
        notes: item.notes || null,
        station: item.categoryKdsStation,
        status: 'pending',
        routedAt: kdsItem.routed_at,
        startedAt: null,
        readyAt: null,
        deliveredAt: null,
        elapsedSeconds: 0,
      });
    }

    return routed;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. OBTENER ITEMS PENDIENTES PARA UNA ESTACIÓN
  // ═══════════════════════════════════════════════════════════════════════════
  async getPendingItems(
    storeId: string,
    station: string,
  ): Promise<KdsItem[]> {
    const rows = await this.dataSource.query(
      `SELECT
         ki.id,
         ki.order_id         AS "orderId",
         ki.order_item_id    AS "orderItemId",
         o.order_number      AS "orderNumber",
         o.customer_name     AS "customerName",
         o.order_type        AS "orderType",
         oi.product_name     AS "productName",
         oi.quantity,
         oi.notes,
         ks.slug             AS station,
         ki.status,
         ki.routed_at        AS "routedAt",
         ki.started_at       AS "startedAt",
         ki.ready_at         AS "readyAt",
         ki.delivered_at     AS "deliveredAt",
         EXTRACT(EPOCH FROM (NOW() - ki.routed_at))::int AS "elapsedSeconds"
       FROM kds_order_items ki
       JOIN kds_stations ks ON ks.id = ki.kds_station_id
       JOIN orders o        ON o.id = ki.order_id
       JOIN order_items oi  ON oi.id = ki.order_item_id
       WHERE ks.store_id = $1
         AND ks.slug = $2
         AND ki.status NOT IN ('delivered')
       ORDER BY ki.routed_at ASC`,
      [storeId, station],
    );

    // Obtener modificadores para cada item
    for (const row of rows) {
      const mods = await this.dataSource.query(
        `SELECT modifier_name FROM order_item_modifiers
         WHERE order_item_id = $1`,
        [row.orderItemId],
      );
      row.modifiers = mods.map((m: any) => m.modifier_name);
    }

    return rows;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. MARCAR ITEM COMO LISTO (preparador terminó)
  // ═══════════════════════════════════════════════════════════════════════════
  async markItemReady(kdsOrderItemId: string): Promise<KdsItem> {
    await this.dataSource.query(
      `UPDATE kds_order_items
       SET status = 'ready', ready_at = NOW()
       WHERE id = $1`,
      [kdsOrderItemId],
    );

    return this.getKdsItem(kdsOrderItemId);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. MARCAR ITEM COMO ENTREGADO (bump)
  // ═══════════════════════════════════════════════════════════════════════════
  async markItemDelivered(kdsOrderItemId: string): Promise<KdsItem> {
    await this.dataSource.query(
      `UPDATE kds_order_items
       SET status = 'delivered', delivered_at = NOW()
       WHERE id = $1`,
      [kdsOrderItemId],
    );

    return this.getKdsItem(kdsOrderItemId);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. CHECK SI TODA LA ORDEN ESTÁ LISTA
  // ═══════════════════════════════════════════════════════════════════════════
  async checkOrderComplete(orderId: string): Promise<boolean> {
    const [{ pending_count }] = await this.dataSource.query(
      `SELECT COUNT(*) AS pending_count
       FROM kds_order_items
       WHERE order_id = $1 AND status NOT IN ('ready', 'delivered')`,
      [orderId],
    );

    if (Number(pending_count) === 0) {
      await this.dataSource.query(
        `UPDATE orders SET status = 'ready' WHERE id = $1`,
        [orderId],
      );
      return true;
    }
    return false;
  }

  // ─── Helper privado ───────────────────────────────────────────────────────
  private async getKdsItem(kdsOrderItemId: string): Promise<KdsItem> {
    const [row] = await this.dataSource.query(
      `SELECT
         ki.id,
         ki.order_id AS "orderId",
         ki.order_item_id AS "orderItemId",
         o.order_number AS "orderNumber",
         o.customer_name AS "customerName",
         o.order_type AS "orderType",
         oi.product_name AS "productName",
         oi.quantity,
         oi.notes,
         ks.slug AS station,
         ki.status,
         ki.routed_at AS "routedAt",
         ki.started_at AS "startedAt",
         ki.ready_at AS "readyAt",
         ki.delivered_at AS "deliveredAt",
         EXTRACT(EPOCH FROM (NOW() - ki.routed_at))::int AS "elapsedSeconds"
       FROM kds_order_items ki
       JOIN kds_stations ks ON ks.id = ki.kds_station_id
       JOIN orders o ON o.id = ki.order_id
       JOIN order_items oi ON oi.id = ki.order_item_id
       WHERE ki.id = $1`,
      [kdsOrderItemId],
    );

    const mods = await this.dataSource.query(
      `SELECT modifier_name FROM order_item_modifiers WHERE order_item_id = $1`,
      [row.orderItemId],
    );
    row.modifiers = mods.map((m: any) => m.modifier_name);

    return row;
  }
}
