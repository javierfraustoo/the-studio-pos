import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { KdsService } from './kds.service';

// ─────────────────────────────────────────────────────────────────────────────
// KDS WebSocket Gateway
//
// Arquitectura de Rooms (Socket.io):
//   - Cada tablet KDS se une a un room basado en su estación:
//       "kds:bar:{storeId}"      → KDS de Barra (bebidas)
//       "kds:kitchen:{storeId}"  → KDS de Cocina (alimentos)
//   - El POS principal se une a:
//       "pos:{storeId}"          → Recibe actualizaciones de estado
//
// Eventos emitidos por el servidor:
//   "kds:new-items"     → Nuevos items enrutados a una estación
//   "kds:item-updated"  → Un item cambió de estado (ready, delivered)
//   "kds:order-complete"→ Todos los items de una orden están listos
//
// Eventos recibidos del cliente:
//   "kds:join"          → Tablet se registra en su room
//   "kds:mark-ready"    → Barista/cocinero marca un item como listo
//   "kds:mark-delivered" → Item entregado al cliente
//   "kds:bump"          → Quitar item de la pantalla KDS (después de entregado)
// ─────────────────────────────────────────────────────────────────────────────

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/kds',
  transports: ['websocket', 'polling'],
})
export class KdsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(KdsGateway.name);

  constructor(private readonly kdsService: KdsService) {}

  afterInit() {
    this.logger.log('KDS WebSocket Gateway initialized');
  }

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // JOIN — Tablet KDS se registra en su estación
  // Payload: { storeId, station: "bar" | "kitchen" }
  // ═══════════════════════════════════════════════════════════════════════════
  @SubscribeMessage('kds:join')
  async handleJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { storeId: string; station: string },
  ) {
    const room = `kds:${data.station}:${data.storeId}`;
    await client.join(room);
    this.logger.log(`Client ${client.id} joined room: ${room}`);

    // Enviar items pendientes actuales
    const pendingItems = await this.kdsService.getPendingItems(
      data.storeId,
      data.station,
    );

    client.emit('kds:current-items', pendingItems);
    return { status: 'joined', room };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // JOIN POS — Terminal POS se registra para recibir actualizaciones
  // ═══════════════════════════════════════════════════════════════════════════
  @SubscribeMessage('pos:join')
  async handlePosJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { storeId: string },
  ) {
    const room = `pos:${data.storeId}`;
    await client.join(room);
    return { status: 'joined', room };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MARK READY — Preparador marca item como listo
  // ═══════════════════════════════════════════════════════════════════════════
  @SubscribeMessage('kds:mark-ready')
  async handleMarkReady(
    @MessageBody() data: { kdsOrderItemId: string; storeId: string },
  ) {
    const updated = await this.kdsService.markItemReady(data.kdsOrderItemId);

    // Notificar a la estación KDS
    const room = `kds:${updated.station}:${data.storeId}`;
    this.server.to(room).emit('kds:item-updated', updated);

    // Notificar al POS
    this.server.to(`pos:${data.storeId}`).emit('kds:item-updated', updated);

    // Verificar si toda la orden está lista
    const orderComplete = await this.kdsService.checkOrderComplete(
      updated.orderId,
    );
    if (orderComplete) {
      this.server.to(`pos:${data.storeId}`).emit('kds:order-complete', {
        orderId: updated.orderId,
        orderNumber: updated.orderNumber,
      });
    }

    return updated;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MARK DELIVERED — Item entregado (bump de pantalla)
  // ═══════════════════════════════════════════════════════════════════════════
  @SubscribeMessage('kds:mark-delivered')
  async handleMarkDelivered(
    @MessageBody() data: { kdsOrderItemId: string; storeId: string },
  ) {
    const updated = await this.kdsService.markItemDelivered(
      data.kdsOrderItemId,
    );

    const room = `kds:${updated.station}:${data.storeId}`;
    this.server.to(room).emit('kds:item-updated', updated);
    this.server.to(`pos:${data.storeId}`).emit('kds:item-updated', updated);

    return updated;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MÉTODO PÚBLICO — Llamado por OrdersService al crear una orden
  //   Enruta los items a las estaciones KDS correspondientes
  // ═══════════════════════════════════════════════════════════════════════════
  async routeOrderToKds(
    storeId: string,
    orderId: string,
    items: Array<{
      orderItemId: string;
      productName: string;
      quantity: number;
      categoryKdsStation: string; // "bar" | "kitchen" | "none"
      modifiers: string[];
      notes?: string;
    }>,
    orderNumber: number,
    customerName?: string,
    orderType?: string,
  ) {
    const routedItems = await this.kdsService.routeItems(
      storeId,
      orderId,
      items,
    );

    // Agrupar por estación y emitir a cada room
    const byStation = new Map<string, typeof routedItems>();

    for (const item of routedItems) {
      const existing = byStation.get(item.station) || [];
      existing.push(item);
      byStation.set(item.station, existing);
    }

    for (const [station, stationItems] of byStation) {
      const room = `kds:${station}:${storeId}`;
      this.server.to(room).emit('kds:new-items', {
        orderId,
        orderNumber,
        customerName,
        orderType,
        items: stationItems,
        timestamp: new Date(),
      });

      this.logger.log(
        `Routed ${stationItems.length} items to ${room} for order #${orderNumber}`,
      );
    }
  }
}
