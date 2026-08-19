import { ITraceService } from '@application/ports/trace.service';
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { from, Observable, tap } from 'rxjs';

@Injectable()
export class TracingInterceptor implements NestInterceptor {
  constructor(private readonly _tracer: ITraceService) {}
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    // const call = context.switchToRpc();
    // const metadata: Metadata = call.getContext();
    const methodName = context.getHandler().name;

    //Extract tracing context

    return from(
      this._tracer.startActiveSpan(`gRPC.${methodName}`, (span) => {
        return next.handle().pipe(
          tap({
            complete: () => span.setAttribute('method.name', methodName),
            error: () => span.setAttribute('method.name', methodName),
          }),
        );
      }),
    );
  }
}
