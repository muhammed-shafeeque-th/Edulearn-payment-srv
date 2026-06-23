import { ErrorCode } from 'src/shared/exceptions/error-codes';
import { DomainException } from './domain.exception';

export class PaymentFailedException extends DomainException {
  constructor(message: string) {
    super(ErrorCode.FAILED_PRECONDITION, message, 'PAYMENT_FAILURE_EXCEPTION');
    this.name = 'PAYMENT_FAILURE_EXCEPTION';
  }
}
