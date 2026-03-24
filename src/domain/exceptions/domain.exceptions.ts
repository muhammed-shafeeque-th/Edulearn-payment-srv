import { status as GrpcStatus, ServiceError } from '@grpc/grpc-js';
import { DomainException } from './base.exception';

export class NotFoundException extends DomainException {
  errorCode: string = 'NOT_FOUND_EXCEPTION';
  constructor(message?: string) {
    super(message || `Resource your are requested not found`);
  }
  serializeGrpcError(): ServiceError {
    return this.toGrpcError(this.message, GrpcStatus.NOT_FOUND, this.errorCode);
  }

  serializeError(): { message: string; field?: string }[] {
    return [{ message: this.message }];
  }
}
export class UserNotFoundException extends DomainException {
  errorCode: string = 'USER_NOT_FOUND_EXCEPTION';
  constructor(message?: string) {
    super(message || `User your are requested not found`);
  }

  serializeGrpcError(): ServiceError {
    return this.toGrpcError(this.message, GrpcStatus.NOT_FOUND, this.errorCode);
  }

  serializeError(): { message: string; field?: string }[] {
    return [{ message: this.message }];
  }
}
export class ClientServiceException extends DomainException {
  errorCode: string = 'CLIENT_SERVICE_EXCEPTION';
  constructor(message?: string) {
    super(message || `Something went wrong while client service request`);
  }

  serializeGrpcError(): ServiceError {
    return this.toGrpcError(
      this.message,
      GrpcStatus.INVALID_ARGUMENT,
      this.errorCode,
    );
  }

  serializeError(): { message: string; field?: string }[] {
    return [{ message: this.message }];
  }
}
export class OrderNotFoundException extends DomainException {
  errorCode: string = 'ORDER_NOT_FOUND_EXCEPTION';
  constructor(message?: string) {
    super(message || `Order your have requested not found`);
  }

  serializeGrpcError(): ServiceError {
    return this.toGrpcError(this.message, GrpcStatus.NOT_FOUND, this.errorCode);
  }

  serializeError(): { message: string; field?: string }[] {
    return [{ message: this.message }];
  }
}
export class IdempotencyException extends DomainException {
  errorCode: string = 'IDEMPOTENCY_EXCEPTION';
  constructor(message?: string) {
    super(message || `Idempotency exception`);
  }

  serializeGrpcError(): ServiceError {
    return this.toGrpcError(
      this.message,
      GrpcStatus.ALREADY_EXISTS,
      this.errorCode,
    );
  }

  serializeError(): { message: string; field?: string }[] {
    return [{ message: this.message }];
  }
}
export class TimeoutException extends DomainException {
  errorCode: string = 'TIMEOUT_EXCEPTION';
  constructor(message?: string) {
    super(message || `Timeout exception`);
  }

  serializeGrpcError(): ServiceError {
    return this.toGrpcError(
      this.message,
      GrpcStatus.DEADLINE_EXCEEDED,
      this.errorCode,
    );
  }

  serializeError(): { message: string; field?: string }[] {
    return [{ message: this.message }];
  }
}
export class PaymentFailureException extends DomainException {
  errorCode: string = 'PAYMENT_FAILURE_EXCEPTION';
  constructor(message?: string) {
    super(message || `Error while processing payment`);
  }

  serializeGrpcError(): ServiceError {
    return this.toGrpcError(
      this.message,
      GrpcStatus.INVALID_ARGUMENT,
      this.errorCode,
    );
  }

  serializeError(): { message: string; field?: string }[] {
    return [{ message: this.message }];
  }
}
export class RefundFailedException extends DomainException {
  errorCode: string = 'REFUND_FAILURE_EXCEPTION';
  constructor(message?: string) {
    super(message || `Error while processing refund request`);
  }

  serializeGrpcError(): ServiceError {
    return this.toGrpcError(
      this.message,
      GrpcStatus.INVALID_ARGUMENT,
      this.errorCode,
    );
  }

  serializeError(): { message: string; field?: string }[] {
    return [{ message: this.message }];
  }
}
