export class RefundFailedException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'REFUND_FAILURE_EXCEPTION';
  }
}
