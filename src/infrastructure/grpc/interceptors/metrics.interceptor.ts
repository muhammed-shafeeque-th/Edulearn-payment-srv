import { MetricsService } from '@infrastructure/observability/metrics/metrics.service';
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const startTime = Date.now();
    const methodName = context.getHandler().name;
    const request = context.switchToRpc().getData();

    return next.handle().pipe(
      tap({
        next: () => {
          this.metrics.incPaymentCounter({
            method: methodName,
            status: 'SUCCESS',
            gateway: request.paymentGateway || 'unknown',
          });
          this.metrics.paymentLatency.observe(
            {
              method: methodName,
              gateway: request.paymentGateway || 'unknown',
            },
            (Date.now() - startTime) / 1000,
          );
        },
        error: () => {
          this.metrics.incPaymentCounter({
            method: methodName,
            status: 'FAILED',
            gateway: request.paymentGateway || 'unknown',
          });
          this.metrics.paymentLatency.observe(
            { method: methodName, gateway: 'unknown' },
            (Date.now() - startTime) / 1000,
          );
        },
      }),
    );
  }
}
