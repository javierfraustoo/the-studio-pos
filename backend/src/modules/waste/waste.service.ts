import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export type WasteReason =
  | 'dropped'
  | 'expired'
  | 'wrong_order'
  | 'quality'
  | 'overproduction'
  | 'other';

export interface RegisterWasteDto {
  storeId: string;
  inventoryItemId?: string;  // merma de insumo
  productId?: string;        // merma de producto terminado
  quantity: number;
  reason: WasteReason;
  notes?: string;
  performedBy: string;
}

@Injectable()
export class WasteService {
  private readonly logger = new Logger(WasteService.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Registra una merma.
   * - Si es un insumo: descuenta directamente del inventario (FIFO).
   * - Si es un producto terminado: descuenta todos los insumos de su receta.
   * En ambos casos, registra el movement como tipo 'waste'.
   */
  async registerWaste(dto: RegisterWasteDto) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Determinar costo unitario
      let unitCost = 0;

      if (dto.inventoryItemId) {
        // Merma de insumo directo
        const [item] = await queryRunner.query(
          `SELECT cost_per_unit FROM inventory_items WHERE id = $1`,
          [dto.inventoryItemId],
        );
        unitCost = Number(item?.cost_per_unit || 0);

        // Descontar del inventario FIFO
        await this.deductWasteFifo(
          queryRunner,
          dto.inventoryItemId,
          dto.quantity,
          dto.performedBy,
        );
      }

      if (dto.productId) {
        // Merma de producto terminado → descontar todos los insumos de la receta
        const recipeLines = await queryRunner.query(
          `SELECT r.inventory_item_id, r.quantity, ii.cost_per_unit
           FROM recipes r
           JOIN inventory_items ii ON ii.id = r.inventory_item_id
           WHERE r.product_id = $1 AND r.deleted_at IS NULL`,
          [dto.productId],
        );

        for (const line of recipeLines) {
          const totalQty = Number(line.quantity) * dto.quantity;
          unitCost += Number(line.cost_per_unit) * Number(line.quantity);

          await this.deductWasteFifo(
            queryRunner,
            line.inventory_item_id,
            totalQty,
            dto.performedBy,
          );
        }
      }

      // Registrar en waste_logs
      const [wasteLog] = await queryRunner.query(
        `INSERT INTO waste_logs
           (store_id, inventory_item_id, product_id, quantity, unit_cost,
            reason, notes, performed_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          dto.storeId,
          dto.inventoryItemId || null,
          dto.productId || null,
          dto.quantity,
          unitCost,
          dto.reason,
          dto.notes || null,
          dto.performedBy,
        ],
      );

      await queryRunner.commitTransaction();

      this.logger.log(
        `Waste registered: ${dto.quantity} units, reason=${dto.reason}, cost=$${(dto.quantity * unitCost).toFixed(2)}`,
      );

      return wasteLog;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private async deductWasteFifo(
    queryRunner: any,
    inventoryItemId: string,
    quantity: number,
    performedBy: string,
  ) {
    const batches = await queryRunner.query(
      `SELECT id, quantity_remaining FROM inventory_batches
       WHERE inventory_item_id = $1 AND quantity_remaining > 0 AND deleted_at IS NULL
       ORDER BY received_at ASC FOR UPDATE`,
      [inventoryItemId],
    );

    let remaining = quantity;
    for (const batch of batches) {
      if (remaining <= 0) break;
      const deduct = Math.min(remaining, Number(batch.quantity_remaining));

      await queryRunner.query(
        `UPDATE inventory_batches SET quantity_remaining = quantity_remaining - $1 WHERE id = $2`,
        [deduct, batch.id],
      );

      await queryRunner.query(
        `INSERT INTO inventory_movements
           (inventory_item_id, batch_id, movement_type, quantity, reference_type, notes, performed_by)
         VALUES ($1, $2, 'waste', $3, 'waste_log', 'Merma registrada', $4)`,
        [inventoryItemId, batch.id, -deduct, performedBy],
      );

      remaining -= deduct;
    }
  }
}
