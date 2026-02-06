import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { LoggingService } from '@infrastructure/observability/logging/logging.service';
import { TracingService } from '@infrastructure/observability/tracing/trace.service';
import { IPaymentRepository } from '@domain/repositories/payment-repository.interface';
import { HandlePaymentTimeoutUseCase } from '@application/use-cases/payments/handle-payment-timeout.use-case';

@Injectable()
export class PaymentTimeoutSweeper {
  private readonly BATCH_SIZE = 50;

  constructor(
    private readonly paymentRepository: IPaymentRepository,
    private readonly handleTimeoutUseCase: HandlePaymentTimeoutUseCase,
    private readonly logger: LoggingService,
    private readonly tracer: TracingService,
  ) {}

  /**
   * Safety-net expiration
   * Runs every minute
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async sweepExpiredPayments(): Promise<void> {
    await this.tracer.startActiveSpan(
      'PaymentTimeoutSweeper.sweepExpiredPayments',
      async (span) => {
        const now = new Date();

        const expiredPayments =
          await this.paymentRepository.findExpiredPendingPayments(
            now,
            this.BATCH_SIZE,
          );

        if (expiredPayments.length === 0) {
          return;
        }

        this.logger.warn(
          `Sweeper found ${expiredPayments.length} expired pending payments`,
          { ctx: 'PaymentTimeoutSweeper' },
        );

        for (const payment of expiredPayments) {
          try {
            await this.handleTimeoutUseCase.execute({
              paymentId: payment.id,
            });
          } catch (error: any) {
            this.logger.error(
              `Sweeper failed for payment ${payment.id}: ${error.message}`,
              { error, ctx: 'PaymentTimeoutSweeper' },
            );
          }
        }

        span.setAttribute('expired.count', expiredPayments.length);
      },
    );
  }
}
