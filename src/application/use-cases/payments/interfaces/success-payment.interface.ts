import { PaymentProvider } from '@domain/entities/payments';

export abstract class ISuccessPaymentUseCase {
  /**
   * Mark payment as success with provider order id and provider.
   *
   *  @param provider The payment provider.
   * @param providerOrderId The unique provider order/payment ID.
   */
  abstract execute(
    provider: PaymentProvider,
    providerOrderId: string,
  ): Promise<boolean>;
}
