import { PaymentGateway } from '@domain/entities/payments';
import { CreatePaymentRequest } from '@infrastructure/grpc/generated/payment-service';
import { Type } from 'class-transformer';
import {
  IsString,
  IsNotEmpty,
  IsEnum,
  Min,
  ValidateNested,
  IsOptional,
} from 'class-validator';

class AmountDto {
  @Min(0)
  amount!: number;

  @IsString()
  @IsNotEmpty()
  currency!: string;
}

export class PaymentCreateDto implements CreatePaymentRequest {
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @IsString()
  @IsNotEmpty()
  orderId!: string;

  @IsNotEmpty()
  @ValidateNested()
  @Type(() => AmountDto)
  amount!: AmountDto;

  @IsEnum(PaymentGateway)
  @IsNotEmpty()
  paymentGateway!: PaymentGateway;

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
