import { PaymentProviderRefund } from '@domain/entities/refund-provider.entity';

export abstract class IRefundRepository {
  abstract save(refund: PaymentProviderRefund): Promise<void>;
  abstract findById(id: string): Promise<PaymentProviderRefund | null>;
  abstract findByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<PaymentProviderRefund | null>;
  abstract update(refund: PaymentProviderRefund): Promise<void>;
}
