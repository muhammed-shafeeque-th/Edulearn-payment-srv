import { ILoggerService } from '@application/ports/logger.service';
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(private readonly _logger: ILoggerService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const call$ = next.handle();
    const methodName = context.getHandler().name;

    this._logger.debug(`gRPC method ${methodName} called`, {
      ctx: 'LoggingInterceptor',
    });

    return call$.pipe(
      tap({
        next: () =>
          this._logger.debug(`gRPC method ${methodName} completed`, {
            ctx: 'LoggingInterceptor',
          }),
        error: (error) =>
          this._logger.error(
            `gRPC method ${methodName} failed: ${error.message}`,
            { error, ctx: 'LoggingInterceptor' },
          ),
      }),
    );
  }
}
