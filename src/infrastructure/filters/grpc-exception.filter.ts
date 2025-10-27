import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
} from '@nestjs/common';
import { LoggingService } from '../observability/logging/logging.service';
import { status } from '@grpc/grpc-js';
import { RpcException } from '@nestjs/microservices';

@Catch()
export class GrpcExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: LoggingService) {}

  catch(exception: any, _host: ArgumentsHost) {
    let statusCode = status.INTERNAL;
    let message = 'Internal server error';
    // const _ctx = _host.switchToRpc();

    // Handle validation errors
    if (exception instanceof BadRequestException) {
      statusCode = status.INVALID_ARGUMENT;
      const response = exception.getResponse();
      message =
        typeof response === 'string'
          ? response
          : (response as any).message.join(', ');
    } else if (exception instanceof RpcException) {
      const error = exception.getError();
      if (typeof error === 'object' && 'code' in error && 'message' in error) {
        statusCode = (error as any).code;
        message = (error as any).message;
      } else {
        message = error.toString();
      }
    } else {
      this.logger.error(`Unexpected error: ${exception.message}`, {
        ...exception,
        ctx: GrpcExceptionFilter.name,
      });
      message = exception.message || 'Internal server error';
    }

    throw new RpcException({
      code: statusCode,
      message,
    });
  }
}
