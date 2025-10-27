import { RazorpayVerifyPaymentRequest } from '@infrastructure/grpc/generated/payment-service';
import { IsString, IsNotEmpty } from 'class-validator';

export class VerifyStripePaymentDto implements RazorpayVerifyPaymentRequest {
  @IsString()
  @IsNotEmpty()
  providerOrderId!: string;
}
