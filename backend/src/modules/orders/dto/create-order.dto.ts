import {
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

// ─── Modifier aplicado a un item ────────────────────────────────────────────
export class OrderItemModifierDto {
  @IsUUID()
  @IsNotEmpty()
  modifier_id: string;
}

// ─── Cada línea de la orden ─────────────────────────────────────────────────
export class OrderItemDto {
  @IsUUID()
  @IsNotEmpty()
  product_id: string;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemModifierDto)
  @IsOptional()
  modifiers?: OrderItemModifierDto[];

  @IsString()
  @IsOptional()
  notes?: string;
}

// ─── Pago incluido en la orden (one-tap checkout) ───────────────────────────
export class PaymentDto {
  @IsEnum(['cash', 'card', 'stripe', 'adyen', 'other'])
  payment_method: 'cash' | 'card' | 'stripe' | 'adyen' | 'other';

  @IsOptional()
  @IsString()
  reference?: string; // Stripe payment_intent_id, etc.
}

// ─── DTO principal para crear una orden ─────────────────────────────────────
export class CreateOrderDto {
  @IsUUID()
  @IsNotEmpty()
  store_id: string;

  @IsEnum(['dine_in', 'to_go', 'pickup'])
  @IsOptional()
  order_type?: 'dine_in' | 'to_go' | 'pickup';

  @IsString()
  @IsOptional()
  customer_name?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  @IsNotEmpty()
  items: OrderItemDto[];

  @ValidateNested()
  @Type(() => PaymentDto)
  @IsNotEmpty()
  payment: PaymentDto;
}
