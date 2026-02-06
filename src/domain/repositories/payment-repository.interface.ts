import { Payment, PaymentStatus } from '@domain/entities/payments';

export abstract class IPaymentRepository {
  abstract save(payment: Payment): Promise<void>;
  abstract findById(id: string): Promise<Payment | null>;
  abstract findByProviderOrderId(
    providerOrderId: string,
  ): Promise<Payment | null>;
  abstract findByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<Payment | null>;
  abstract findByStatus(status: PaymentStatus): Promise<Payment[]>;
  abstract update(payment: Payment): Promise<void>;
  abstract findPaymentWithSessions(paymentId: string): Promise<Payment | null>;
  abstract findExpiredPendingPayments(
    now: Date,
    limit: number,
  ): Promise<Payment[]>;
}
