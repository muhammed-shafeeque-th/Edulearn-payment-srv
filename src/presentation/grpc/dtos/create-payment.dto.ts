import { IsString, IsNotEmpty, IsEnum, IsOptional } from 'class-validator';

/**
 * Enums copied from proto-generated sources. Should use the same as in generated/payment/common.ts
 */
export enum Provider {
  PROVIDER_UNSPECIFIED = 0,
  STRIPE = 1,
  RAZORPAY = 2,
  PAYPAL = 3,
  UNRECOGNIZED = -1,
}

export enum PaymentStatus {
  UNKNOWN = 0,
  PENDING = 1,
  PAID = 2,
  FAILED = 3,
  CANCELLED = 4,
  UNRECOGNIZED = -1,
}

export class PaymentCreateDto {
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @IsString()
  @IsNotEmpty()
  orderId!: string;

  @IsString()
  @IsNotEmpty()
  idempotencyKey!: string;
}

export class CreateProviderSessionDto {
  @IsString()
  @IsNotEmpty()
  paymentId!: string;

  @IsEnum(Provider)
  @IsNotEmpty()
  provider!: Provider;

  @IsOptional()
  @IsString()
  cancelUrl?: string | undefined;

  @IsOptional()
  @IsString()
  successUrl?: string | undefined;
}
