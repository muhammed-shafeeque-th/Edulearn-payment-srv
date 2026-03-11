import { Injectable } from '@nestjs/common';
import { LoggingService } from '@infrastructure/observability/logging/logging.service';
import { MetricsService } from '@infrastructure/observability/metrics/metrics.service';
import { TracingService } from '@infrastructure/observability/tracing/trace.service';
import { IPaymentRepository } from '@domain/repositories/payment-repository.interface';
import { IKafkaProducer } from '@application/adaptors/kafka-producer.interface';
import { PaymentStatus } from '@domain/entities/payments';
import { KafkaTopics } from 'src/shared/event-topics';
import { OrderPaymentTimeoutEvent } from '@domain/events/order-payment.events';
import { v4 as uuidV4 } from 'uuid';
import { ICacheService } from '@application/adaptors/redis.interface';
import { ProviderSessionStatus } from '@domain/entities/payment-provider-sesssion.entity';

@Injectable()
export class HandlePaymentTimeoutUseCase {
  private readonly TIMEOUT_KEY_PREFIX = 'payments:timeout';
  private readonly LOCK_KEY_PREFIX = 'payments:timeout-lock';
  private readonly LOCK_TTL_MS = 30_000;

  constructor(
    private readonly paymentRepository: IPaymentRepository,
    private readonly kafkaProducer: IKafkaProducer,
    private readonly logger: LoggingService,
    private readonly metrics: MetricsService,
    private readonly tracer: TracingService,
    private readonly cacheService: ICacheService,
  ) {}

  public async execute({
    paymentId,
    expiresAt,
  }: {
    paymentId: string;
    expiresAt?: string;
  }) {
    return this.tracer.startActiveSpan(
      'HandlePaymentTimeoutUseCase.execute',
      async (span) => {
        span.setAttributes({ paymentId, expiresAt });
        try {
          this.logger.debug(
            `Timeout check for payment ${paymentId} (expiresAt=${expiresAt ?? 'unknown'})`,
          );

          const timeoutKey = this.timeoutKey(paymentId);
          const ttlSeconds = await this.cacheService.getTTL(timeoutKey);

          if (ttlSeconds > 0) {
            this.logger.debug(
              `Payment ${paymentId} TTL ${ttlSeconds}s, not expiring.`,
            );
            return;
          } else if (ttlSeconds === -1) {
            this.logger.warn(
              `Payment ${paymentId} timeout key exists without TTL, expiring to avoid dangling session.`,
            );
          }

          const lockKey = this.lockKey(paymentId);
          if (!(await this.cacheService.lock(lockKey, this.LOCK_TTL_MS))) {
            this.logger.warn(
              `Timeout for payment ${paymentId} already handled by another worker.`,
            );
            return;
          }
          try {
            // Might have been rescheduled seconds earlier (race condition)
            if (await this.cacheService.exists(timeoutKey)) {
              this.logger.debug(
                `Payment ${paymentId} was rescheduled. Skipping expiration.`,
              );
              return;
            }
            if (await this.finalizeTimeout(paymentId)) {
              await this.cacheService.del(timeoutKey);
            }
          } finally {
            await this.cacheService.unlock(lockKey);
          }
        } catch (error) {
          this.logger.warn(
            'Error while executing HandlePaymentTimeoutUseCase',
            { error, ctx: HandlePaymentTimeoutUseCase.name },
          );
        }
      },
    );
  }

  private async finalizeTimeout(paymentId: string): Promise<boolean> {
    return this.tracer.startActiveSpan(
      'HandlePaymentTimeoutUseCase.finalizeTimeout',
      async (span) => {
        span.setAttribute('payment.id', paymentId);

        this.logger.debug(`Evaluating timeout for payment ${paymentId}`);
        const payment = await this.paymentRepository.findById(paymentId);
        if (!payment) {
          this.logger.error(`Payment ${paymentId} not found`);
          return false;
        }
        if (payment.status !== PaymentStatus.PENDING) {
          this.logger.debug(
            `Payment ${paymentId} already finalized: ${payment.status}`,
          );
          return false;
        }
        if (!payment.expiresAt) {
          this.logger.warn(`Payment ${paymentId} has no expiresAt. Skipping.`);
          return false;
        }
        if (payment.expiresAt > new Date()) {
          this.logger.debug(
            `Payment ${paymentId} not expired yet. Re-scheduling.`,
          );
          await this.rescheduleTimeout(payment);
          return false;
        }

        payment.markExpired();
        await this.paymentRepository.save(payment);
        this.logger.warn(`Payment ${paymentId} EXPIRED`);

        const providerSession = payment.getSessionByProviderSessionId(
          payment.providerOrderId!,
        );
        providerSession?.updateStatus(ProviderSessionStatus.FAILED);

        await this.kafkaProducer.produce<OrderPaymentTimeoutEvent>(
          KafkaTopics.PaymentOrderTimeout,
          {
            key: payment.userId,
            value: {
              eventId: uuidV4(),
              eventType: 'OrderPaymentTimeoutEvent',
              source: 'payment-service',
              timestamp: Date.now(),
              payload: {
                paymentId: payment.id,
                orderId: payment.orderId,
                provider: providerSession?.provider,
                userId: payment.userId,
                providerOrderId: payment.providerOrderId,
                paymentStatus: payment.status,
              },
            },
          },
        );

        this.metrics.incPaymentCounter({
          method: 'payment_timeout',
          status: 'EXPIRED',
        });

        return true;
      },
    );
  }

  private timeoutKey(paymentId: string) {
    return `${this.TIMEOUT_KEY_PREFIX}:${paymentId}`;
  }

  private lockKey(paymentId: string) {
    return `${this.LOCK_KEY_PREFIX}:${paymentId}`;
  }

  private async rescheduleTimeout(payment: {
    id: string;
    expiresAt?: Date;
    orderId: string;
    userId: string;
  }) {
    if (!payment.expiresAt) {
      this.logger.warn(
        `Cannot reschedule timeout for payment ${payment.id}: expiresAt missing.`,
      );
      return;
    }
    const ttl = payment.expiresAt.getTime() - Date.now();
    if (ttl <= 0) {
      this.logger.warn(
        `Payment ${payment.id} already expired, not re-scheduling.`,
      );
      return;
    }
    const timeoutKey = this.timeoutKey(payment.id);
    await this.cacheService.set(
      timeoutKey,
      JSON.stringify({
        paymentId: payment.id,
        expiresAt: payment.expiresAt.toISOString(),
        orderId: payment.orderId,
        userId: payment.userId,
      }),
      Math.ceil(ttl / 1000),
    );
    this.logger.debug(
      `Rescheduled timeout for payment ${payment.id}; TTL=${Math.ceil(ttl / 1000)}s.`,
    );
  }
}
