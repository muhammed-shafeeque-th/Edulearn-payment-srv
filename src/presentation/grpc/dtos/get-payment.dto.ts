import { GetPaymentRequest } from '@infrastructure/grpc/generated/payment_service';
import { IsString, IsNotEmpty } from 'class-validator';

export class VerifyRazorpayPaymentDto implements GetPaymentRequest {
  @IsString()
  @IsNotEmpty()
  paymentId!: string;
}
