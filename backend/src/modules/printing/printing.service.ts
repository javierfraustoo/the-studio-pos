import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import * as net from 'net';
import {
  PrintableOrder,
  buildBarOrderTicket,
  buildReceiptTicket,
} from './escpos.builder';

// ─── Configuración de la cola ───────────────────────────────────────────────
const POLL_INTERVAL_MS = 1000;    // Polling cada 1 segundo
const MAX_ATTEMPTS = 3;           // Reintentos por job
const TCP_TIMEOUT_MS = 5000;      // Timeout de conexión TCP a la impresora
const RETRY_DELAY_MS = 2000;      // Delay entre reintentos

// ─────────────────────────────────────────────────────────────────────────────
// PRINTING SERVICE
//
// Implementa una cola de impresión persistente (respaldada en PostgreSQL)
// con reintentos automáticos. Los jobs se envían a impresoras térmicas
// vía TCP raw (protocolo ESC/POS sobre socket directo al puerto 9100).
//
// Flujo:
//   1. OrdersService llama enqueueBarOrder/enqueueReceipt
//   2. Se inserta un registro en print_jobs con status='pending'
//   3. El worker (loop de polling) levanta los jobs pendientes
//   4. Se conecta vía TCP a la impresora y envía el buffer ESC/POS
//   5. Actualiza status a 'completed' o 'failed' con retry
//
// Alternativa para producción: reemplazar polling con pg_notify o Redis pub/sub
// ─────────────────────────────────────────────────────────────────────────────
@Injectable()
export class PrintingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrintingService.name);
  private pollingTimer: ReturnType<typeof setInterval> | null = null;
  private isProcessing = false;

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  // ═══════════════════════════════════════════════════════════════════════════
  // LIFECYCLE
  // ═══════════════════════════════════════════════════════════════════════════

  onModuleInit() {
    this.startWorker();
    this.logger.log('Print queue worker started');
  }

  onModuleDestroy() {
    this.stopWorker();
    this.logger.log('Print queue worker stopped');
  }

  private startWorker() {
    this.pollingTimer = setInterval(() => {
      this.processQueue().catch((err) =>
        this.logger.error(`Queue processing error: ${err.message}`),
      );
    }, POLL_INTERVAL_MS);
  }

  private stopWorker() {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. ENCOLAR COMANDA DE BARRA
  // ═══════════════════════════════════════════════════════════════════════════
  async enqueueBarOrder(storeId: string, order: PrintableOrder): Promise<void> {
    await this.dataSource.query(
      `INSERT INTO print_jobs (store_id, printer_name, job_type, payload)
       VALUES ($1, 'bar_printer', 'bar_order', $2)`,
      [storeId, JSON.stringify(order)],
    );
    this.logger.log(`Bar order job enqueued for order #${order.order_number}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. ENCOLAR RECIBO
  // ═══════════════════════════════════════════════════════════════════════════
  async enqueueReceipt(storeId: string, order: PrintableOrder): Promise<void> {
    await this.dataSource.query(
      `INSERT INTO print_jobs (store_id, printer_name, job_type, payload)
       VALUES ($1, 'receipt_printer', 'receipt', $2)`,
      [storeId, JSON.stringify(order)],
    );
    this.logger.log(`Receipt job enqueued for order #${order.order_number}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. PROCESADOR DE COLA (Worker)
  // ═══════════════════════════════════════════════════════════════════════════
  private async processQueue(): Promise<void> {
    // Evitar procesamiento concurrente
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      // Obtener jobs pendientes (oldest first), máximo 10 por ciclo
      // FOR UPDATE SKIP LOCKED permite múltiples workers sin conflicto
      const jobs: Array<{
        id: string;
        store_id: string;
        printer_name: string;
        job_type: string;
        payload: any;
        attempts: number;
        max_attempts: number;
      }> = await this.dataSource.query(
        `SELECT id, store_id, printer_name, job_type, payload, attempts, max_attempts
         FROM print_jobs
         WHERE status = 'pending'
         ORDER BY created_at ASC
         LIMIT 10
         FOR UPDATE SKIP LOCKED`,
      );

      for (const job of jobs) {
        await this.processJob(job);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. PROCESAR UN JOB INDIVIDUAL
  // ═══════════════════════════════════════════════════════════════════════════
  private async processJob(job: {
    id: string;
    store_id: string;
    printer_name: string;
    job_type: string;
    payload: any;
    attempts: number;
    max_attempts: number;
  }): Promise<void> {
    try {
      // Marcar como "printing"
      await this.dataSource.query(
        `UPDATE print_jobs SET status = 'printing', attempts = attempts + 1 WHERE id = $1`,
        [job.id],
      );

      // Obtener configuración de la impresora
      const printers = await this.dataSource.query(
        `SELECT ip_address, port, paper_width
         FROM printers
         WHERE store_id = $1 AND name = $2 AND is_active = TRUE
         LIMIT 1`,
        [job.store_id, job.printer_name],
      );

      if (printers.length === 0) {
        throw new Error(
          `Printer "${job.printer_name}" not found for store ${job.store_id}`,
        );
      }

      const printer = printers[0];
      const order: PrintableOrder = job.payload;

      // Construir el buffer ESC/POS según el tipo de job
      let buffer: Buffer;

      switch (job.job_type) {
        case 'bar_order':
          buffer = buildBarOrderTicket(order, printer.paper_width);
          break;

        case 'receipt': {
          // Obtener datos de la tienda para el header del recibo
          const stores = await this.dataSource.query(
            `SELECT name, address FROM stores WHERE id = $1`,
            [job.store_id],
          );
          const store = stores[0] || { name: 'THE STUDIO', address: '' };
          buffer = buildReceiptTicket(
            order,
            store.name,
            store.address || '',
            printer.paper_width,
          );
          break;
        }

        default:
          throw new Error(`Unknown job type: ${job.job_type}`);
      }

      // Enviar a la impresora vía TCP
      await this.sendToPrinter(printer.ip_address, printer.port, buffer);

      // Marcar como completado
      await this.dataSource.query(
        `UPDATE print_jobs SET status = 'completed', processed_at = NOW() WHERE id = $1`,
        [job.id],
      );

      this.logger.log(
        `Print job ${job.id} completed → ${printer.ip_address}:${printer.port}`,
      );
    } catch (error) {
      const newAttempts = job.attempts + 1;

      if (newAttempts >= job.max_attempts) {
        // Max reintentos alcanzados → marcar como failed
        await this.dataSource.query(
          `UPDATE print_jobs
           SET status = 'failed', error_message = $1, processed_at = NOW()
           WHERE id = $2`,
          [error.message, job.id],
        );
        this.logger.error(
          `Print job ${job.id} FAILED after ${newAttempts} attempts: ${error.message}`,
        );
      } else {
        // Devolver a pending para reintento
        await this.dataSource.query(
          `UPDATE print_jobs
           SET status = 'pending', error_message = $1
           WHERE id = $2`,
          [error.message, job.id],
        );
        this.logger.warn(
          `Print job ${job.id} attempt ${newAttempts} failed, will retry: ${error.message}`,
        );
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. ENVIAR BUFFER RAW A IMPRESORA VÍA TCP (puerto 9100)
  //
  //    Las impresoras térmicas ESC/POS aceptan conexiones TCP directas.
  //    Se envía el buffer binario y se cierra la conexión.
  //    Compatible con:
  //      - EPSON TM-m30II, TM-T88VI (puerto 9100)
  //      - Star Micronics TSP143IV (puerto 9100)
  //      - Bixolon SRP-350 (puerto 9100)
  // ═══════════════════════════════════════════════════════════════════════════
  private sendToPrinter(
    ip: string,
    port: number,
    buffer: Buffer,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = new net.Socket();

      // Timeout de conexión
      socket.setTimeout(TCP_TIMEOUT_MS);

      socket.on('timeout', () => {
        socket.destroy();
        reject(new Error(`Connection timeout to printer ${ip}:${port}`));
      });

      socket.on('error', (err) => {
        socket.destroy();
        reject(
          new Error(`Printer connection error ${ip}:${port}: ${err.message}`),
        );
      });

      socket.connect(port, ip, () => {
        socket.write(buffer, (err) => {
          if (err) {
            socket.destroy();
            reject(
              new Error(`Write error to printer ${ip}:${port}: ${err.message}`),
            );
          } else {
            // Esperar un momento para que la impresora procese, luego cerrar
            setTimeout(() => {
              socket.end();
              resolve();
            }, 200);
          }
        });
      });

      socket.on('close', () => {
        // Conexión cerrada limpiamente
      });
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. UTILIDADES ADMINISTRATIVAS
  // ═══════════════════════════════════════════════════════════════════════════

  /** Reintentar un job fallido manualmente */
  async retryJob(jobId: string): Promise<void> {
    await this.dataSource.query(
      `UPDATE print_jobs
       SET status = 'pending', attempts = 0, error_message = NULL
       WHERE id = $1 AND status = 'failed'`,
      [jobId],
    );
  }

  /** Abrir el cajón de dinero (envía pulse al pin RJ11 de la impresora) */
  async openCashDrawer(storeId: string): Promise<void> {
    const printers = await this.dataSource.query(
      `SELECT ip_address, port FROM printers
       WHERE store_id = $1 AND name = 'receipt_printer' AND is_active = TRUE
       LIMIT 1`,
      [storeId],
    );

    if (printers.length === 0) {
      throw new Error('Receipt printer not found');
    }

    const { ip_address, port } = printers[0];

    // Comando ESC/POS para abrir cajón: ESC p 0 25 25
    const drawerKick = Buffer.from([0x1b, 0x70, 0x00, 0x19, 0x19]);

    await this.sendToPrinter(ip_address, port, drawerKick);
    this.logger.log(`Cash drawer opened via ${ip_address}:${port}`);
  }

  /** Test de conectividad: envía un ticket de prueba */
  async testPrinter(storeId: string, printerName: string): Promise<boolean> {
    try {
      const printers = await this.dataSource.query(
        `SELECT ip_address, port, paper_width FROM printers
         WHERE store_id = $1 AND name = $2 AND is_active = TRUE
         LIMIT 1`,
        [storeId, printerName],
      );

      if (printers.length === 0) return false;

      const { ip_address, port, paper_width } = printers[0];
      const { EscPosBuilder } = await import('./escpos.builder');

      const builder = new EscPosBuilder(paper_width);
      builder
        .alignCenter()
        .bold(true)
        .line('*** TEST DE IMPRESION ***')
        .bold(false)
        .line('THE STUDIO POS')
        .line(new Date().toLocaleString('es-MX'))
        .line('Impresora OK')
        .separator()
        .feed(3)
        .cut();

      await this.sendToPrinter(ip_address, port, builder.build());
      return true;
    } catch {
      return false;
    }
  }
}
