import { RazorpayVerifyPaymentRequest } from '@infrastructure/grpc/generated/payment-service';
import { IsString, IsNotEmpty } from 'class-validator';

export class VerifyRazorpayPaymentDto implements RazorpayVerifyPaymentRequest {
  @IsString()
  @IsNotEmpty()
  razorpayOrderId!: string;

  @IsString()
  @IsNotEmpty()
  paymentId!: string;

  @IsString()
  @IsNotEmpty()
  razorpayPaymentId!: string;

  @IsString()
  @IsNotEmpty()
  razorpaySignature!: string;
}
