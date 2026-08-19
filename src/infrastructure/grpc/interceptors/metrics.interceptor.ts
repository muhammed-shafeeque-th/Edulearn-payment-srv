import { IMetricService } from '@application/ports/metric.service';
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
  constructor(private readonly _metrics: IMetricService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const startTime = Date.now();
    const methodName = context.getHandler().name;
    const request = context.switchToRpc().getData();

    return next.handle().pipe(
      tap({
        next: () => {
          this._metrics.incPaymentCounter({
            method: methodName,
            status: 'SUCCESS',
            gateway: request.paymentGateway || 'unknown',
          });
          this._metrics.paymentLatency.observe(
            {
              method: methodName,
              gateway: request.paymentGateway || 'unknown',
            },
            (Date.now() - startTime) / 1000,
          );
        },
        error: () => {
          this._metrics.incPaymentCounter({
            method: methodName,
            status: 'FAILED',
            gateway: request.paymentGateway || 'unknown',
          });
          this._metrics.paymentLatency.observe(
            { method: methodName, gateway: 'unknown' },
            (Date.now() - startTime) / 1000,
          );
        },
      }),
    );
  }
}
