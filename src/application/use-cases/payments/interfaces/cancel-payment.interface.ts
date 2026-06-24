import { CancelPaymentDto } from 'src/presentation/grpc/dtos/cancel-payment.dto';

export abstract class ICancelPaymentUseCase {
  /**
   * Cancels a payment given a CancelPaymentDto and idempotency key.
   * @param dto CancelPaymentDto containing the details for the payment cancellation.
   * @param idempotencyKeyString The idempotency key as string.
   */
  abstract execute(
    dto: CancelPaymentDto,
    idempotencyKeyString: string,
  ): Promise<{
    paymentId: string;
    providerOrderId: string;
    status: string;
  }>;
}
