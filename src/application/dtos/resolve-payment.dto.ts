import { Type } from 'class-transformer';
import {
  IsString,
  IsNotEmpty,
  IsEnum,
  Min,
  ValidateNested,
} from 'class-validator';

export enum PaymentGateway {
  STRIPE = 'stripe',
  PAYPAL = 'paypal',
}

class AmountDto {
  @Min(0)
  amount!: number;

  @IsString()
  @IsNotEmpty()
  currency!: string;
}

export class PaymentCreateDto {
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
}
