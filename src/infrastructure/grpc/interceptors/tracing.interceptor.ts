import { Metadata } from '@grpc/grpc-js';
import { TracingService } from '@infrastructure/observability/tracing/trace.service';
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { propagation, context as ctx } from '@opentelemetry/api';
import { from, Observable, tap } from 'rxjs';

@Injectable()
export class TracingInterceptor implements NestInterceptor {
  constructor(private readonly tracer: TracingService) {}
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const call = context.switchToRpc();
    const metadata: Metadata = call.getContext();
    const methodName = context.getHandler().name;

    //Extract tracing context
    propagation.extract(ctx.active(), metadata);

    return from(
      this.tracer.startActiveSpan(`gRPC.${methodName}`, (span) => {
        return next.handle().pipe(
          tap({
            complete: () => span.end(),
            error: () => span.end(),
          }),
        );
      }),
    );
  }
}
