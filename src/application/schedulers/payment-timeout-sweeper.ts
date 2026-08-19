import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { IPaymentRepository } from '@domain/repositories/payment-repository.interface';
import { ILoggerService } from '@application/ports/logger.service';
import { ITraceService } from '@application/ports/trace.service';
import { IHandlePaymentTimeoutUseCase } from '@application/use-cases/payments/interfaces/handle-payment-timeout.inteface';

@Injectable()
export class PaymentTimeoutSweeper {
  private readonly BATCH_SIZE = 50;

  constructor(
    private readonly _paymentRepository: IPaymentRepository,
    private readonly handleTimeoutUseCase: IHandlePaymentTimeoutUseCase,
    private readonly _logger: ILoggerService,
    private readonly _tracer: ITraceService,
  ) {}

  /**
   * Safety-net expiration
   * Runs every minute
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async sweepExpiredPayments(): Promise<void> {
    await this._tracer.startActiveSpan(
      'PaymentTimeoutSweeper.sweepExpiredPayments',
      async (span) => {
        const now = new Date();

        const expiredPayments =
          await this._paymentRepository.findExpiredPendingPayments(
            now,
            this.BATCH_SIZE,
          );

        if (expiredPayments.length === 0) {
          return;
        }

        this._logger.warn(
          `Sweeper found ${expiredPayments.length} expired pending payments`,
          { ctx: 'PaymentTimeoutSweeper' },
        );

        for (const payment of expiredPayments) {
          try {
            await this.handleTimeoutUseCase.execute({
              paymentId: payment.id,
            });
          } catch (error: any) {
            this._logger.error(
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
