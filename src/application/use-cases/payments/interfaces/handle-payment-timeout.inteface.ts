export abstract class IHandlePaymentTimeoutUseCase {
  abstract execute({
    paymentId,
    expiresAt,
  }: {
    paymentId: string;
    expiresAt?: string;
  }): Promise<void>;
}
