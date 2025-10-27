import { CapturePaymentRequest } from '@infrastructure/grpc/generated/payment-service';
import { IsString, IsNotEmpty } from 'class-validator';

export class CapturePaymentDto implements CapturePaymentRequest {
  @IsString()
  @IsNotEmpty()
  paymentId!: string;

  @IsString()
  @IsNotEmpty()
  providerOrderId!: string;

  @IsString()
  @IsNotEmpty()
  userId!: string;
}
