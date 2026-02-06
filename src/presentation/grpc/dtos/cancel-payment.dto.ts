import { Provider } from '@infrastructure/grpc/generated/payment/common';
import { IsString, IsNotEmpty, IsOptional, IsEnum } from 'class-validator';

export enum PaymentProvider {
  STRIPE = Provider.STRIPE,
  RAZORPAY = Provider.RAZORPAY,
  PAYPAL = Provider.PAYPAL,
}

export class CancelPaymentDto {
  @IsEnum(PaymentProvider)
  provider!: Provider;

  @IsString()
  @IsNotEmpty()
  providerOrderId!: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
