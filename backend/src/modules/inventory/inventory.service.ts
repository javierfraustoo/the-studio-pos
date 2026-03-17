import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, QueryRunner } from 'typeorm';

// ─── Tipos internos ─────────────────────────────────────────────────────────

/** Una línea de "bill of materials" ya resuelta para descontar */
export interface MaterialRequirement {
  inventory_item_id: string;
  inventory_item_name: string;
  quantity_needed: number; // cantidad total a descontar
}

/** Resultado del descuento FIFO de un solo material */
export interface FifoDeductionResult {
  inventory_item_id: string;
  total_deducted: number;
  batches_used: Array<{
    batch_id: string;
    quantity_deducted: number;
    remaining_after: number;
  }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// INVENTORY SERVICE — Lógica FIFO
// ─────────────────────────────────────────────────────────────────────────────
@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. RESOLVER RECETA (escandallo) CON MODIFICADORES
  //    Dado un product_id y una lista de modifier_ids, devuelve la lista
  //    final de materiales y cantidades a descontar.
  // ═══════════════════════════════════════════════════════════════════════════
  async resolveRecipe(
    productId: string,
    modifierIds: string[],
    quantity: number,
    queryRunner: QueryRunner,
  ): Promise<MaterialRequirement[]> {
    // 1a. Obtener la receta base del producto
    const baseRecipe: Array<{
      inventory_item_id: string;
      name: string;
      quantity: number;
    }> = await queryRunner.query(
      `SELECT r.inventory_item_id,
              ii.name,
              r.quantity
       FROM recipes r
       JOIN inventory_items ii ON ii.id = r.inventory_item_id
       WHERE r.product_id = $1`,
      [productId],
    );

    // Mapa mutable: inventory_item_id → cantidad
    const materials = new Map<string, { name: string; qty: number }>();

    for (const line of baseRecipe) {
      materials.set(line.inventory_item_id, {
        name: line.name,
        qty: line.quantity,
      });
    }

    // 1b. Aplicar ajustes de modificadores
    if (modifierIds.length > 0) {
      const adjustments: Array<{
        replaces_inventory_item_id: string | null;
        inventory_item_id: string;
        name: string;
        quantity: number;
      }> = await queryRunner.query(
        `SELECT mra.replaces_inventory_item_id,
                mra.inventory_item_id,
                ii.name,
                mra.quantity
         FROM modifier_recipe_adjustments mra
         JOIN inventory_items ii ON ii.id = mra.inventory_item_id
         WHERE mra.modifier_id = ANY($1)`,
        [modifierIds],
      );

      for (const adj of adjustments) {
        // Si reemplaza un item de la receta base, eliminarlo
        if (adj.replaces_inventory_item_id) {
          materials.delete(adj.replaces_inventory_item_id);
        }

        // Agregar (o sumar) el nuevo item
        const existing = materials.get(adj.inventory_item_id);
        if (existing) {
          existing.qty += adj.quantity;
        } else {
          materials.set(adj.inventory_item_id, {
            name: adj.name,
            qty: adj.quantity,
          });
        }
      }
    }

    // 1c. Multiplicar por la cantidad de items en la orden
    const result: MaterialRequirement[] = [];
    for (const [itemId, mat] of materials) {
      result.push({
        inventory_item_id: itemId,
        inventory_item_name: mat.name,
        quantity_needed: mat.qty * quantity,
      });
    }

    return result;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. DESCUENTO FIFO
  //    Recorre los lotes del material desde el más antiguo (received_at ASC)
  //    y descuenta hasta cubrir la cantidad necesaria.
  //    Usa SELECT ... FOR UPDATE para evitar race conditions.
  // ═══════════════════════════════════════════════════════════════════════════
  async deductFifo(
    requirement: MaterialRequirement,
    orderId: string,
    employeeId: string,
    queryRunner: QueryRunner,
  ): Promise<FifoDeductionResult> {
    const { inventory_item_id, quantity_needed } = requirement;

    // Obtener lotes con stock, ordenados FIFO (más viejo primero)
    // FOR UPDATE bloquea las filas durante la transacción
    const batches: Array<{
      id: string;
      quantity_remaining: number;
    }> = await queryRunner.query(
      `SELECT id, quantity_remaining
       FROM inventory_batches
       WHERE inventory_item_id = $1
         AND quantity_remaining > 0
       ORDER BY received_at ASC
       FOR UPDATE`,
      [inventory_item_id],
    );

    let remaining = quantity_needed;
    const batchesUsed: FifoDeductionResult['batches_used'] = [];

    for (const batch of batches) {
      if (remaining <= 0) break;

      const deduct = Math.min(remaining, Number(batch.quantity_remaining));
      const newRemaining = Number(batch.quantity_remaining) - deduct;

      // Actualizar el lote
      await queryRunner.query(
        `UPDATE inventory_batches
         SET quantity_remaining = $1
         WHERE id = $2`,
        [newRemaining, batch.id],
      );

      // Registrar el movimiento (audit trail)
      await queryRunner.query(
        `INSERT INTO inventory_movements
           (inventory_item_id, batch_id, movement_type, quantity,
            reference_type, reference_id, performed_by)
         VALUES ($1, $2, 'sale', $3, 'order', $4, $5)`,
        [inventory_item_id, batch.id, -deduct, orderId, employeeId],
      );

      batchesUsed.push({
        batch_id: batch.id,
        quantity_deducted: deduct,
        remaining_after: newRemaining,
      });

      remaining -= deduct;
    }

    // Si no alcanzó el stock, loguear advertencia pero NO bloquear la venta
    // (en una cafetería no puedes decirle al cliente que no hay café si ya lo preparaste)
    if (remaining > 0) {
      this.logger.warn(
        `Stock insuficiente para ${requirement.inventory_item_name}: ` +
          `necesario=${quantity_needed}, faltante=${remaining.toFixed(3)}. ` +
          `La orden ${orderId} generó stock negativo virtual.`,
      );
    }

    return {
      inventory_item_id,
      total_deducted: quantity_needed - remaining,
      batches_used: batchesUsed,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. DESCONTAR INVENTARIO COMPLETO PARA UNA ORDEN
  //    Orquesta resolveRecipe + deductFifo para todos los items de la orden.
  // ═══════════════════════════════════════════════════════════════════════════
  async deductForOrder(
    items: Array<{
      product_id: string;
      quantity: number;
      modifier_ids: string[];
    }>,
    orderId: string,
    employeeId: string,
    queryRunner: QueryRunner,
  ): Promise<FifoDeductionResult[]> {
    // Consolidar todos los materiales de todos los items
    const allMaterials = new Map<string, MaterialRequirement>();

    for (const item of items) {
      const recipe = await this.resolveRecipe(
        item.product_id,
        item.modifier_ids,
        item.quantity,
        queryRunner,
      );

      for (const mat of recipe) {
        const existing = allMaterials.get(mat.inventory_item_id);
        if (existing) {
          existing.quantity_needed += mat.quantity_needed;
        } else {
          allMaterials.set(mat.inventory_item_id, { ...mat });
        }
      }
    }

    // Descontar cada material usando FIFO
    const results: FifoDeductionResult[] = [];

    for (const requirement of allMaterials.values()) {
      const result = await this.deductFifo(
        requirement,
        orderId,
        employeeId,
        queryRunner,
      );
      results.push(result);
    }

    return results;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. VERIFICAR DISPONIBILIDAD (pre-check antes de la orden)
  // ═══════════════════════════════════════════════════════════════════════════
  async checkAvailability(
    items: Array<{
      product_id: string;
      quantity: number;
      modifier_ids: string[];
    }>,
  ): Promise<{
    available: boolean;
    shortages: Array<{
      item_name: string;
      needed: number;
      available: number;
    }>;
  }> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();

    try {
      const allMaterials = new Map<string, MaterialRequirement>();

      for (const item of items) {
        const recipe = await this.resolveRecipe(
          item.product_id,
          item.modifier_ids,
          item.quantity,
          queryRunner,
        );
        for (const mat of recipe) {
          const existing = allMaterials.get(mat.inventory_item_id);
          if (existing) {
            existing.quantity_needed += mat.quantity_needed;
          } else {
            allMaterials.set(mat.inventory_item_id, { ...mat });
          }
        }
      }

      const shortages: Array<{
        item_name: string;
        needed: number;
        available: number;
      }> = [];

      for (const req of allMaterials.values()) {
        const [{ total }] = await queryRunner.query(
          `SELECT COALESCE(SUM(quantity_remaining), 0) AS total
           FROM inventory_batches
           WHERE inventory_item_id = $1 AND quantity_remaining > 0`,
          [req.inventory_item_id],
        );

        if (Number(total) < req.quantity_needed) {
          shortages.push({
            item_name: req.inventory_item_name,
            needed: req.quantity_needed,
            available: Number(total),
          });
        }
      }

      return {
        available: shortages.length === 0,
        shortages,
      };
    } finally {
      await queryRunner.release();
    }
  }
}
