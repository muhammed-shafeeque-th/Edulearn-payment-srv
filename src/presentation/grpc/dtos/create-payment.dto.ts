import { CreatePaymentRequest } from '@infrastructure/grpc/generated/payment_service';
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

export class PaymentCreateDto implements CreatePaymentRequest {
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @IsString()
  @IsNotEmpty()
  orderId!: string;

  @IsEnum(Provider)
  @IsNotEmpty()
  provider!: Provider;

  @IsString()
  @IsNotEmpty()
  idempotencyKey!: string;

  @IsOptional()
  @IsString()
  cancelUrl?: string | undefined;

  @IsOptional()
  @IsString()
  successUrl?: string | undefined;
}
