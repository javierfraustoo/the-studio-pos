import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UsePipes,
  ValidationPipe,
  Headers,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';

@Controller('api/v1/orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  /**
   * POST /api/v1/orders
   *
   * Crea una nueva orden.
   * Flujo interno:
   *   1. Valida productos y modificadores
   *   2. Calcula precios
   *   3. Inserta orden + items + modificadores
   *   4. Descuenta inventario con FIFO
   *   5. Registra pago
   *   6. Encola impresión de comanda y recibo
   *
   * Toda la lógica de negocio (pasos 1-5) corre en una transacción SERIALIZABLE.
   * La impresión (paso 6) es fire-and-forget para no bloquear la respuesta al cajero.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async createOrder(
    @Body() dto: CreateOrderDto,
    @Headers('x-employee-id') employeeId: string,
    // En producción: @CurrentUser() employee extraído del JWT/Guard
  ) {
    const order = await this.ordersService.createOrder(dto, employeeId);

    return {
      success: true,
      data: order,
    };
  }
}

// ─── Ejemplo de request body ────────────────────────────────────────────────
//
// POST /api/v1/orders
// Headers:
//   x-employee-id: <uuid-del-barista>
//
// Body:
// {
//   "store_id": "uuid-tienda",
//   "order_type": "to_go",
//   "customer_name": "Carlos",
//   "items": [
//     {
//       "product_id": "uuid-latte-12oz",
//       "quantity": 1,
//       "modifiers": [
//         { "modifier_id": "uuid-leche-avena" },
//         { "modifier_id": "uuid-shot-extra" }
//       ],
//       "notes": "Extra caliente"
//     },
//     {
//       "product_id": "uuid-americano-16oz",
//       "quantity": 2,
//       "modifiers": []
//     }
//   ],
//   "payment": {
//     "payment_method": "card",
//     "reference": "pi_1234567890_stripe"
//   }
// }
//
// Response (201):
// {
//   "success": true,
//   "data": {
//     "id": "uuid-orden",
//     "order_number": 42,
//     "status": "in_progress",
//     "order_type": "to_go",
//     "customer_name": "Carlos",
//     "subtotal": 195.00,
//     "total": 195.00,
//     "items": [...],
//     "payment": { "payment_method": "card", "amount": 195.00 },
//     "created_at": "2025-..."
//   }
// }
