import { BaseException } from 'src/shared/exceptions/base-exception';
import { ErrorCode } from 'src/shared/exceptions/error-codes';

export class RefundFailedException extends BaseException {
  constructor(message: string) {
    super(ErrorCode.FAILED_PRECONDITION, message, 'REFUND_FAILURE_EXCEPTION');
    this.name = 'REFUND_FAILURE_EXCEPTION';
  }
}
