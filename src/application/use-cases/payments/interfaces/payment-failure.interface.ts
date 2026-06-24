import { PaymentProvider } from '@domain/entities/payments';

export abstract class IPaymentFailureUseCase {
  /**
   * Marks a payment as failed by provider details, and broadcasts payment failed event.
   *
   * @param provider The payment provider (enum value).
   * @param providerOrderId The unique provider order/payment ID.
   */
  abstract execute(
    provider: PaymentProvider,
    providerOrderId: string,
  ): Promise<boolean>;
}
