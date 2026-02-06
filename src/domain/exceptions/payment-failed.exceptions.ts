export class PaymentFailedException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PAYMENT_FAILURE_EXCEPTION';
  }
}
