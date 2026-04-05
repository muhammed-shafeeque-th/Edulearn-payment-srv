import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
} from '@nestjs/common';
import { LoggingService } from '../observability/logging/logging.service';
import { status, Metadata as GrpcMetadata } from '@grpc/grpc-js';
import { RpcException } from '@nestjs/microservices';
import { throwError } from 'rxjs';
import { GrpcExceptionMapper } from './grpc-exception.mapper';
import { BaseException } from 'src/shared/exceptions/base-exception';

@Catch()
export class GrpcExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: LoggingService) {}

  catch(exception: any, _host: ArgumentsHost) {
    // const _ctx = host.switchToRpc();

    let code = status.INTERNAL;
    let message = 'Internal server error';
    let details: string | undefined;
    let metadata: GrpcMetadata | undefined = undefined;

    // Handle DomainException by returning the full grpc ServiceError (with metadata)
    if (exception instanceof BaseException) {
      this.logger.warn(`DomainException: ${exception.message}`, {
        ctx: GrpcExceptionFilter.name,
        stack: exception.stack,
      });
      // The client will get all fields (code, message, metadata, etc.)
      const grpcError = GrpcExceptionMapper.toGrpc(exception);

      code = grpcError.code;
      message = grpcError.message;
      metadata = grpcError.metadata;
      details = grpcError.details;

      // Handle validation/BadRequest errors
    } else if (exception instanceof BadRequestException) {
      code = status.INVALID_ARGUMENT;
      const response = exception.getResponse();
      message =
        typeof response === 'string'
          ? response
          : Array.isArray((response as any).message)
            ? (response as any).message.join(', ')
            : (response as any).message || 'Validation failed';
      details = message;
    }

    // Handle RpcException (from nest microservices)
    else if (exception instanceof RpcException) {
      const error = exception.getError();
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        'message' in error
      ) {
        code = Number((error as any).code) ?? status.UNKNOWN;
        message = String((error as any).message) ?? 'Unknown gRPC error';
        if ('metadata' in error && error.metadata instanceof GrpcMetadata) {
          metadata = error.metadata;
        }
      } else if (typeof error === 'string') {
        message = error;
        code = status.UNKNOWN;
      }
    }

    // All other/unexpected errors
    else {
      this.logger.error(
        `Unexpected error: ${exception?.message || exception}`,
        {
          ctx: GrpcExceptionFilter.name,
          stack: exception?.stack,
          ...exception,
        },
      );
      message = exception?.message || 'Internal server error';
      code = status.INTERNAL;
    }

    return throwError(() => ({
      code,
      message,
      metadata,
      details,
    }));
  }
}
