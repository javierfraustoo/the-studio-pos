import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CreateOrderDto } from './dto/create-order.dto';
import { InventoryService } from '../inventory/inventory.service';
import { PrintingService } from '../printing/printing.service';

// ─── Tipos de respuesta ─────────────────────────────────────────────────────

interface OrderItemResult {
  id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  modifiers_total: number;
  subtotal: number;
  modifiers: Array<{
    modifier_name: string;
    price_adjustment: number;
  }>;
}

interface OrderResult {
  id: string;
  order_number: number;
  status: string;
  order_type: string;
  customer_name: string | null;
  subtotal: number;
  total: number;
  items: OrderItemResult[];
  payment: {
    payment_method: string;
    amount: number;
  };
  created_at: Date;
}

// ─────────────────────────────────────────────────────────────────────────────
// ORDERS SERVICE
// Orquesta todo el flujo: validar → crear orden → descontar inventario →
// registrar pago → encolar impresión
// ─────────────────────────────────────────────────────────────────────────────
@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly inventoryService: InventoryService,
    private readonly printingService: PrintingService,
  ) {}

  // ═══════════════════════════════════════════════════════════════════════════
  // CREAR ORDEN — Flujo completo dentro de una transacción ACID
  // ═══════════════════════════════════════════════════════════════════════════
  async createOrder(
    dto: CreateOrderDto,
    employeeId: string,
  ): Promise<OrderResult> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction('SERIALIZABLE');

    try {
      // ─── 1. Obtener el siguiente número de orden para la tienda ────────
      const [{ next_number }] = await queryRunner.query(
        `SELECT COALESCE(MAX(order_number), 0) + 1 AS next_number
         FROM orders
         WHERE store_id = $1
           AND created_at >= CURRENT_DATE`,
        [dto.store_id],
      );
      const orderNumber: number = Number(next_number);

      // ─── 2. Resolver precios y validar productos ──────────────────────
      const resolvedItems: Array<{
        product_id: string;
        product_name: string;
        quantity: number;
        unit_price: number;
        modifiers_total: number;
        subtotal: number;
        modifier_ids: string[];
        modifiers_detail: Array<{
          modifier_id: string;
          modifier_name: string;
          price_adjustment: number;
        }>;
        notes?: string;
      }> = [];

      for (const item of dto.items) {
        // Obtener producto
        const products = await queryRunner.query(
          `SELECT id, name, price FROM products
           WHERE id = $1 AND is_active = TRUE`,
          [item.product_id],
        );

        if (products.length === 0) {
          throw new NotFoundException(
            `Producto ${item.product_id} no encontrado o inactivo`,
          );
        }

        const product = products[0];
        let modifiersTotal = 0;
        const modifierIds: string[] = [];
        const modifiersDetail: Array<{
          modifier_id: string;
          modifier_name: string;
          price_adjustment: number;
        }> = [];

        // Resolver modificadores
        if (item.modifiers && item.modifiers.length > 0) {
          for (const mod of item.modifiers) {
            const modifiers = await queryRunner.query(
              `SELECT id, name, price_adjustment FROM modifiers
               WHERE id = $1 AND is_active = TRUE`,
              [mod.modifier_id],
            );

            if (modifiers.length === 0) {
              throw new NotFoundException(
                `Modificador ${mod.modifier_id} no encontrado`,
              );
            }

            const modifier = modifiers[0];
            modifiersTotal += Number(modifier.price_adjustment);
            modifierIds.push(modifier.id);
            modifiersDetail.push({
              modifier_id: modifier.id,
              modifier_name: modifier.name,
              price_adjustment: Number(modifier.price_adjustment),
            });
          }
        }

        const lineSubtotal =
          (Number(product.price) + modifiersTotal) * item.quantity;

        resolvedItems.push({
          product_id: product.id,
          product_name: product.name,
          quantity: item.quantity,
          unit_price: Number(product.price),
          modifiers_total: modifiersTotal,
          subtotal: lineSubtotal,
          modifier_ids: modifierIds,
          modifiers_detail: modifiersDetail,
          notes: item.notes,
        });
      }

      // ─── 3. Calcular totales ──────────────────────────────────────────
      const subtotal = resolvedItems.reduce((sum, i) => sum + i.subtotal, 0);
      const total = subtotal; // Sin descuentos en MVP

      // ─── 4. Insertar la orden ─────────────────────────────────────────
      const [order] = await queryRunner.query(
        `INSERT INTO orders
           (store_id, order_number, order_type, subtotal, total,
            customer_name, notes, created_by, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')
         RETURNING id, order_number, status, order_type, customer_name,
                   subtotal, total, created_at`,
        [
          dto.store_id,
          orderNumber,
          dto.order_type || 'dine_in',
          subtotal,
          total,
          dto.customer_name || null,
          dto.notes || null,
          employeeId,
        ],
      );

      // ─── 5. Insertar items de la orden + sus modificadores ────────────
      const itemResults: OrderItemResult[] = [];

      for (const ri of resolvedItems) {
        const [orderItem] = await queryRunner.query(
          `INSERT INTO order_items
             (order_id, product_id, product_name, quantity,
              unit_price, modifiers_total, subtotal, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING id`,
          [
            order.id,
            ri.product_id,
            ri.product_name,
            ri.quantity,
            ri.unit_price,
            ri.modifiers_total,
            ri.subtotal,
            ri.notes || null,
          ],
        );

        // Insertar modificadores del item
        const modResults: Array<{
          modifier_name: string;
          price_adjustment: number;
        }> = [];

        for (const mod of ri.modifiers_detail) {
          await queryRunner.query(
            `INSERT INTO order_item_modifiers
               (order_item_id, modifier_id, modifier_name, price_adjustment)
             VALUES ($1, $2, $3, $4)`,
            [
              orderItem.id,
              mod.modifier_id,
              mod.modifier_name,
              mod.price_adjustment,
            ],
          );

          modResults.push({
            modifier_name: mod.modifier_name,
            price_adjustment: mod.price_adjustment,
          });
        }

        itemResults.push({
          id: orderItem.id,
          product_name: ri.product_name,
          quantity: ri.quantity,
          unit_price: ri.unit_price,
          modifiers_total: ri.modifiers_total,
          subtotal: ri.subtotal,
          modifiers: modResults,
        });
      }

      // ─── 6. Descontar inventario (FIFO) ───────────────────────────────
      const inventoryItems = resolvedItems.map((ri) => ({
        product_id: ri.product_id,
        quantity: ri.quantity,
        modifier_ids: ri.modifier_ids,
      }));

      await this.inventoryService.deductForOrder(
        inventoryItems,
        order.id,
        employeeId,
        queryRunner,
      );

      // ─── 7. Registrar pago ────────────────────────────────────────────
      await queryRunner.query(
        `INSERT INTO payments (order_id, payment_method, amount, reference, status)
         VALUES ($1, $2, $3, $4, 'completed')`,
        [
          order.id,
          dto.payment.payment_method,
          total,
          dto.payment.reference || null,
        ],
      );

      // ─── 8. Marcar orden como en progreso ─────────────────────────────
      await queryRunner.query(
        `UPDATE orders SET status = 'in_progress' WHERE id = $1`,
        [order.id],
      );

      // ─── 9. COMMIT de la transacción ──────────────────────────────────
      await queryRunner.commitTransaction();

      this.logger.log(
        `Orden #${orderNumber} creada exitosamente (${order.id})`,
      );

      // ─── 10. Encolar impresión (fuera de la transacción) ──────────────
      //     Si falla la impresión, la orden ya está guardada.
      const orderResult: OrderResult = {
        id: order.id,
        order_number: orderNumber,
        status: 'in_progress',
        order_type: dto.order_type || 'dine_in',
        customer_name: dto.customer_name || null,
        subtotal,
        total,
        items: itemResults,
        payment: {
          payment_method: dto.payment.payment_method,
          amount: total,
        },
        created_at: order.created_at,
      };

      // Encolar comanda de barra + recibo (fire-and-forget)
      this.printingService
        .enqueueBarOrder(dto.store_id, orderResult)
        .catch((err) =>
          this.logger.error(`Error encolando comanda barra: ${err.message}`),
        );

      this.printingService
        .enqueueReceipt(dto.store_id, orderResult)
        .catch((err) =>
          this.logger.error(`Error encolando recibo: ${err.message}`),
        );

      return orderResult;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`Error creando orden: ${error.message}`, error.stack);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
