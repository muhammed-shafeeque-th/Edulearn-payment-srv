import { status, Metadata, ServiceError } from '@grpc/grpc-js';
import { BaseException } from 'src/shared/exceptions/base-exception';
import { ErrorCode } from 'src/shared/exceptions/error-codes';

export class GrpcExceptionMapper {
  static toGrpc(error: unknown): ServiceError {
    const metadata = new Metadata();
    if (error instanceof BaseException) {
      metadata.set('error_code', error.code);
      metadata.set('reason', error.reason!);
      metadata.set('detail', error.message);

      return {
        name: error.name,
        message: error.message,
        code: this.mapCategoryToGrpcStatus(error.code),
        details: error.message,
        metadata,
      };
    }

    return {
      name: 'InternalError',
      message: 'Internal server error',
      code: status.INTERNAL,
      details: 'Unknown error',
      metadata,
    };
  }

  private static mapCategoryToGrpcStatus(errorCode: ErrorCode): status {
    switch (errorCode) {
      case ErrorCode.NOT_FOUND:
        return status.NOT_FOUND;
      case ErrorCode.ALREADY_EXISTS:
        return status.ALREADY_EXISTS;
      case ErrorCode.INVALID_ARGUMENT:
        return status.INVALID_ARGUMENT;
      case ErrorCode.UNAUTHENTICATED:
        return status.UNAUTHENTICATED;
      case ErrorCode.PERMISSION_DENIED:
        return status.PERMISSION_DENIED;
      case ErrorCode.CONFLICT:
        return status.ABORTED;
      case ErrorCode.CANCELLED:
        return status.CANCELLED;
      case ErrorCode.OUT_OF_RANGE:
        return status.OUT_OF_RANGE;
      case ErrorCode.BUSINESS_RULE_VIOLATION:
        return status.INVALID_ARGUMENT;
      default:
        return status.INTERNAL;
    }
  }
}
