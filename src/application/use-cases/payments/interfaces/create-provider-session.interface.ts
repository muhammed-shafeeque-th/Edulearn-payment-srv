import { PaymentProvider } from '@domain/entities/payments';

export interface CreateProviderSessionDto {
  paymentId: string;
  provider: number;
  successUrl?: string;
  cancelUrl?: string;
}

export abstract class ICreateProviderSessionUseCase {
  abstract execute(dto: CreateProviderSessionDto): Promise<{
    paymentId: string;
    provider: PaymentProvider;
    session: string;
  }>;
}
