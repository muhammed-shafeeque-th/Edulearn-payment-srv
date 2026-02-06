import { Provider } from '@infrastructure/grpc/generated/payment/common';
import { ResolvePaymentRequest } from '@infrastructure/grpc/generated/payment_service';
import {
  IsString,
  IsNotEmpty,
  ValidateNested,
  IsEnum,
  IsOptional,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum PaymentProvider {
  STRIPE = Provider.STRIPE,
  RAZORPAY = Provider.RAZORPAY,
  PAYPAL = Provider.PAYPAL,
}

export class StripeResolveDto {
  @IsString()
  @IsNotEmpty()
  sessionId!: string;
}

export class RazorpayResolveDto {
  @IsString()
  @IsNotEmpty()
  razorpayOrderId!: string;

  @IsString()
  @IsNotEmpty()
  razorpayPaymentId!: string;

  @IsString()
  @IsNotEmpty()
  razorpaySignature!: string;
}

export class PayPalResolveDto {
  @IsString()
  @IsNotEmpty()
  orderId!: string;
}

export class ResolvePaymentDto implements ResolvePaymentRequest {
  @IsEnum(PaymentProvider)
  provider!: Provider;

  @IsOptional()
  @ValidateNested()
  @Type(() => StripeResolveDto)
  stripe?: StripeResolveDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => RazorpayResolveDto)
  razorpay?: RazorpayResolveDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => PayPalResolveDto)
  paypal?: PayPalResolveDto;
}
