import { DomainException } from './domain.exception';
import { ErrorCode } from 'src/shared/exceptions/error-codes';

export class NotFoundException extends DomainException {
  constructor(message?: string) {
    super(
      ErrorCode.NOT_FOUND,
      message || `Resource your are requested not found`,
      'NOT_FOUND',
    );
  }

  serializeError(): { message: string; field?: string }[] {
    return [{ message: this.message }];
  }
}
export class PaymentNotFoundException extends DomainException {
  constructor(message?: string) {
    super(
      ErrorCode.NOT_FOUND,
      message || `Resource your are requested not found`,
      'PAYMENT_NOT_FOUND',
    );
  }

  serializeError(): { message: string; field?: string }[] {
    return [{ message: this.message }];
  }
}
export class UserNotFoundException extends DomainException {
  errorCode: string = 'USER_NOT_FOUND_EXCEPTION';
  constructor(message?: string) {
    super(
      ErrorCode.NOT_FOUND,
      message || `User your are requested not found`,
      'USER_NOT_FOUND',
    );
  }

  serializeError(): { message: string; field?: string }[] {
    return [{ message: this.message }];
  }
}
export class ClientServiceException extends DomainException {
  errorCode: string = '';
  constructor(message?: string) {
    super(
      ErrorCode.FAILED_PRECONDITION,
      message || `Something went wrong while client service request`,
      'CLIENT_SERVICE_EXCEPTION',
    );
  }

  serializeError(): { message: string; field?: string }[] {
    return [{ message: this.message }];
  }
}
export class OrderNotFoundException extends DomainException {
  errorCode: string = 'ORDER_NOT_FOUND_EXCEPTION';
  constructor(message?: string) {
    super(
      ErrorCode.NOT_FOUND,
      message || `Order your have requested not found`,
      'ORDER_NOT_FOUND',
    );
  }

  serializeError(): { message: string; field?: string }[] {
    return [{ message: this.message }];
  }
}
export class IdempotencyException extends DomainException {
  errorCode: string = 'IDEMPOTENCY_EXCEPTION';
  constructor(message?: string) {
    super(
      ErrorCode.ALREADY_EXISTS,
      message || `Idempotency exception`,
      'IDEMPOTENCY_EXCEPTION',
    );
  }

  serializeError(): { message: string; field?: string }[] {
    return [{ message: this.message }];
  }
}
export class PaymentFailureException extends DomainException {
  errorCode: string = 'PAYMENT_FAILURE_EXCEPTION';
  constructor(message?: string) {
    super(
      ErrorCode.FAILED_PRECONDITION,
      message || `Error while processing payment`,
      'PAYMENT_FAILURE_EXCEPTION',
    );
  }

  serializeError(): { message: string; field?: string }[] {
    return [{ message: this.message }];
  }
}
export class RefundFailedException extends DomainException {
  errorCode: string = 'REFUND_FAILURE_EXCEPTION';
  constructor(message?: string) {
    super(
      ErrorCode.FAILED_PRECONDITION,
      message || `Error while processing refund request`,
      'REFUND_FAILURE_EXCEPTION',
    );
  }

  serializeError(): { message: string; field?: string }[] {
    return [{ message: this.message }];
  }
}
