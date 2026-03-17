/**
 * ESC/POS Command Builder
 *
 * Construye buffers binarios con comandos ESC/POS compatibles con
 * impresoras térmicas como EPSON TM-m30II, Star Micronics TSP143,
 * Bixolon SRP-350, etc.
 *
 * Referencia: https://reference.epson-biz.com/modules/ref_escpos/
 */

// ─── Constantes de comandos ESC/POS ─────────────────────────────────────────
const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

const CMD = {
  // Inicialización
  INIT: Buffer.from([ESC, 0x40]),

  // Alineación
  ALIGN_LEFT: Buffer.from([ESC, 0x61, 0x00]),
  ALIGN_CENTER: Buffer.from([ESC, 0x61, 0x01]),
  ALIGN_RIGHT: Buffer.from([ESC, 0x61, 0x02]),

  // Formato de texto
  BOLD_ON: Buffer.from([ESC, 0x45, 0x01]),
  BOLD_OFF: Buffer.from([ESC, 0x45, 0x00]),
  DOUBLE_HEIGHT_ON: Buffer.from([GS, 0x21, 0x01]),
  DOUBLE_WIDTH_ON: Buffer.from([GS, 0x21, 0x10]),
  DOUBLE_SIZE_ON: Buffer.from([GS, 0x21, 0x11]),
  NORMAL_SIZE: Buffer.from([GS, 0x21, 0x00]),
  UNDERLINE_ON: Buffer.from([ESC, 0x2d, 0x01]),
  UNDERLINE_OFF: Buffer.from([ESC, 0x2d, 0x00]),

  // Corte de papel
  CUT_FULL: Buffer.from([GS, 0x56, 0x00]),
  CUT_PARTIAL: Buffer.from([GS, 0x56, 0x01]),

  // Cajón de dinero (pulse pin 2, 100ms on, 100ms off)
  CASH_DRAWER_KICK: Buffer.from([ESC, 0x70, 0x00, 0x19, 0x19]),

  // Beep (solo EPSON)
  BEEP: Buffer.from([ESC, 0x42, 0x03, 0x02]), // 3 beeps, 200ms

  // Feed
  FEED_3: Buffer.from([ESC, 0x64, 0x03]),
  FEED_5: Buffer.from([ESC, 0x64, 0x05]),
} as const;

// Ancho de papel en caracteres (80mm = 48 chars, 58mm = 32 chars)
type PaperWidth = 48 | 32;

// ─────────────────────────────────────────────────────────────────────────────
// ESC/POS BUILDER — API fluida para construir tickets
// ─────────────────────────────────────────────────────────────────────────────
export class EscPosBuilder {
  private buffers: Buffer[] = [];
  private paperWidth: PaperWidth;

  constructor(paperWidthMm: number = 80) {
    this.paperWidth = paperWidthMm >= 80 ? 48 : 32;
    this.buffers.push(CMD.INIT);
  }

  // ─── Helpers de formato ─────────────────────────────────────────────────

  alignLeft(): this {
    this.buffers.push(CMD.ALIGN_LEFT);
    return this;
  }

  alignCenter(): this {
    this.buffers.push(CMD.ALIGN_CENTER);
    return this;
  }

  alignRight(): this {
    this.buffers.push(CMD.ALIGN_RIGHT);
    return this;
  }

  bold(on: boolean = true): this {
    this.buffers.push(on ? CMD.BOLD_ON : CMD.BOLD_OFF);
    return this;
  }

  doubleSize(on: boolean = true): this {
    this.buffers.push(on ? CMD.DOUBLE_SIZE_ON : CMD.NORMAL_SIZE);
    return this;
  }

  doubleHeight(on: boolean = true): this {
    this.buffers.push(on ? CMD.DOUBLE_HEIGHT_ON : CMD.NORMAL_SIZE);
    return this;
  }

  underline(on: boolean = true): this {
    this.buffers.push(on ? CMD.UNDERLINE_ON : CMD.UNDERLINE_OFF);
    return this;
  }

  // ─── Escritura de texto ─────────────────────────────────────────────────

  text(content: string): this {
    this.buffers.push(Buffer.from(content, 'utf8'));
    return this;
  }

  line(content: string = ''): this {
    this.buffers.push(Buffer.from(content + '\n', 'utf8'));
    return this;
  }

  emptyLine(): this {
    this.buffers.push(Buffer.from('\n', 'utf8'));
    return this;
  }

  /** Línea con texto a la izquierda y derecha (ej: "Latte 12oz       $85.00") */
  columns(left: string, right: string): this {
    const maxLeft = this.paperWidth - right.length - 1;
    const truncatedLeft =
      left.length > maxLeft ? left.substring(0, maxLeft) : left;
    const padding = this.paperWidth - truncatedLeft.length - right.length;
    const spaces = ' '.repeat(Math.max(1, padding));
    return this.line(`${truncatedLeft}${spaces}${right}`);
  }

  /** Línea con 3 columnas (ej: "2x  Americano 16oz        $120.00") */
  columns3(col1: string, col2: string, col3: string): this {
    const col1Width = Math.max(4, col1.length + 1);
    const col3Width = col3.length;
    const col2Width = this.paperWidth - col1Width - col3Width - 1;

    const paddedCol1 = col1.padEnd(col1Width);
    const truncatedCol2 =
      col2.length > col2Width ? col2.substring(0, col2Width) : col2;
    const paddedCol2 = truncatedCol2.padEnd(col2Width);

    return this.line(`${paddedCol1}${paddedCol2} ${col3}`);
  }

  /** Separador horizontal */
  separator(char: string = '-'): this {
    return this.line(char.repeat(this.paperWidth));
  }

  /** Separador doble */
  doubleSeparator(): this {
    return this.separator('=');
  }

  // ─── Acciones ───────────────────────────────────────────────────────────

  feed(lines: number = 3): this {
    this.buffers.push(Buffer.from([ESC, 0x64, lines]));
    return this;
  }

  cut(partial: boolean = true): this {
    this.buffers.push(partial ? CMD.CUT_PARTIAL : CMD.CUT_FULL);
    return this;
  }

  openCashDrawer(): this {
    this.buffers.push(CMD.CASH_DRAWER_KICK);
    return this;
  }

  beep(): this {
    this.buffers.push(CMD.BEEP);
    return this;
  }

  // ─── Build final ───────────────────────────────────────────────────────

  build(): Buffer {
    return Buffer.concat(this.buffers);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TEMPLATES — Funciones que usan el builder para generar tickets específicos
// ─────────────────────────────────────────────────────────────────────────────

export interface PrintableOrder {
  id: string;
  order_number: number;
  order_type: string;
  customer_name: string | null;
  total: number;
  items: Array<{
    product_name: string;
    quantity: number;
    unit_price: number;
    subtotal: number;
    modifiers: Array<{
      modifier_name: string;
      price_adjustment: number;
    }>;
    notes?: string;
  }>;
  payment: {
    payment_method: string;
    amount: number;
  };
  created_at: Date;
}

// ═══════════════════════════════════════════════════════════════════════════
// TEMPLATE: COMANDA DE BARRA
// Optimizada para que el barista lea rápido: letra grande, sin precios
// ═══════════════════════════════════════════════════════════════════════════
export function buildBarOrderTicket(
  order: PrintableOrder,
  paperWidthMm: number = 80,
): Buffer {
  const b = new EscPosBuilder(paperWidthMm);

  const orderType =
    order.order_type === 'to_go'
      ? '** PARA LLEVAR **'
      : order.order_type === 'pickup'
        ? '** PICKUP **'
        : 'MESA';

  b.alignCenter()
    .doubleSize(true)
    .bold(true)
    .line(`BARRA #${order.order_number}`)
    .doubleSize(false)
    .bold(false)
    .emptyLine();

  // Tipo de orden y nombre del cliente
  b.bold(true).line(orderType).bold(false);

  if (order.customer_name) {
    b.doubleHeight(true)
      .line(order.customer_name)
      .doubleHeight(false);
  }

  b.alignLeft().separator();

  // Items — letra grande para visibilidad
  for (const item of order.items) {
    b.doubleHeight(true)
      .bold(true)
      .line(`${item.quantity}x ${item.product_name}`)
      .doubleHeight(false)
      .bold(false);

    // Modificadores indentados
    for (const mod of item.modifiers) {
      b.line(`   + ${mod.modifier_name}`);
    }

    // Notas del item
    if (item.notes) {
      b.bold(true).line(`   >> ${item.notes}`).bold(false);
    }

    b.emptyLine();
  }

  b.separator();

  // Timestamp
  b.alignCenter()
    .line(formatDateTime(order.created_at))
    .emptyLine();

  // Feed y corte
  b.feed(4).cut();

  // Beep para alertar al barista
  b.beep();

  return b.build();
}

// ═══════════════════════════════════════════════════════════════════════════
// TEMPLATE: RECIBO DEL CLIENTE
// Incluye precios, total, método de pago
// ═══════════════════════════════════════════════════════════════════════════
export function buildReceiptTicket(
  order: PrintableOrder,
  storeName: string,
  storeAddress: string,
  paperWidthMm: number = 80,
): Buffer {
  const b = new EscPosBuilder(paperWidthMm);

  // Header de la tienda
  b.alignCenter()
    .doubleSize(true)
    .bold(true)
    .line(storeName)
    .doubleSize(false)
    .bold(false)
    .line(storeAddress)
    .separator();

  // Número de orden
  b.bold(true)
    .line(`ORDEN #${order.order_number}`)
    .bold(false);

  if (order.customer_name) {
    b.line(`Cliente: ${order.customer_name}`);
  }

  const orderTypeLabel =
    order.order_type === 'to_go'
      ? 'Para llevar'
      : order.order_type === 'pickup'
        ? 'Pickup'
        : 'En tienda';
  b.line(orderTypeLabel);
  b.line(formatDateTime(order.created_at));
  b.separator();

  // Items con precios
  b.alignLeft();

  for (const item of order.items) {
    b.columns3(
      `${item.quantity}x`,
      item.product_name,
      formatCurrency(item.unit_price * item.quantity),
    );

    for (const mod of item.modifiers) {
      if (mod.price_adjustment > 0) {
        b.columns(`   + ${mod.modifier_name}`, `+${formatCurrency(mod.price_adjustment)}`);
      } else {
        b.line(`   + ${mod.modifier_name}`);
      }
    }
  }

  b.separator();

  // Total
  b.bold(true)
    .columns('TOTAL', formatCurrency(order.total))
    .bold(false);

  // Método de pago
  const paymentLabel =
    order.payment.payment_method === 'cash'
      ? 'Efectivo'
      : order.payment.payment_method === 'card'
        ? 'Tarjeta'
        : order.payment.payment_method;
  b.columns('Pago', paymentLabel);
  b.columns('Monto', formatCurrency(order.payment.amount));

  b.separator();

  // Footer
  b.alignCenter()
    .emptyLine()
    .line('Gracias por tu visita')
    .line('THE STUDIO COFFEE')
    .emptyLine();

  // Feed y corte
  b.feed(4).cut();

  return b.build();
}

// ─── Utilidades ─────────────────────────────────────────────────────────────

function formatCurrency(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

function formatDateTime(date: Date): string {
  const d = new Date(date);
  return d.toLocaleString('es-MX', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}
