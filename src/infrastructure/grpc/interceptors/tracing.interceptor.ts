import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, defer } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { ITraceService } from '@application/ports/trace.service';

@Injectable()
export class TracingInterceptor implements NestInterceptor {
  constructor(private readonly _tracer: ITraceService) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<any> {
    const methodName = context.getHandler().name;

    return defer(() =>
      this._tracer.startActiveSpan(
        `gRPC.${methodName}`,
        (span) =>
          next.handle().pipe(
            finalize(() => {
              span.setAttribute('method.name', methodName);
              span.end();
            }),
          ),
      ),
    );
  }
}