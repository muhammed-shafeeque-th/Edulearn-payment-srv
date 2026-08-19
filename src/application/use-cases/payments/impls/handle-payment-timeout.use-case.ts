import { Injectable } from '@nestjs/common';
import { IPaymentRepository } from '@domain/repositories/payment-repository.interface';
import { IKafkaProducer } from '@application/ports/kafka-producer.interface';
import { PaymentStatus } from '@domain/entities/payments';
import { KafkaTopics } from 'src/shared/event-topics';
import { OrderPaymentTimeoutEvent } from '@domain/events/order-payment.events';
import { v4 as uuidV4 } from 'uuid';
import { ICacheService } from '@application/ports/redis.interface';
import { ProviderSessionStatus } from '@domain/entities/payment-provider-sesssion.entity';
import { ITraceService } from '@application/ports/trace.service';
import { IMetricService } from '@application/ports/metric.service';
import { ILoggerService } from '@application/ports/logger.service';
import { IHandlePaymentTimeoutUseCase } from '../interfaces/handle-payment-timeout.inteface';

@Injectable()
export class HandlePaymentTimeoutUseCase implements IHandlePaymentTimeoutUseCase {
  private readonly TIMEOUT_KEY_PREFIX = 'payments:timeout';
  private readonly LOCK_KEY_PREFIX = 'payments:timeout-lock';
  private readonly LOCK_TTL_MS = 30_000;

  constructor(
    private readonly _paymentRepository: IPaymentRepository,
    private readonly _kafkaProducer: IKafkaProducer,
    private readonly _logger: ILoggerService,
    private readonly _tracer: ITraceService,
    private readonly _metrics: IMetricService,
    private readonly _cache: ICacheService,
  ) {}

  public async execute({
    paymentId,
    expiresAt,
  }: {
    paymentId: string;
    expiresAt?: string;
  }) {
    return this._tracer.startActiveSpan(
      'HandlePaymentTimeoutUseCase.execute',
      async (span) => {
        span.setAttributes({ paymentId, expiresAt });
        try {
          this._logger.debug(
            `Timeout check for payment ${paymentId} (expiresAt=${expiresAt ?? 'unknown'})`,
          );

          const timeoutKey = this.timeoutKey(paymentId);
          const ttlSeconds = await this._cache.getTTL(timeoutKey);

          if (ttlSeconds > 0) {
            this._logger.debug(
              `Payment ${paymentId} TTL ${ttlSeconds}s, not expiring.`,
            );
            return;
          } else if (ttlSeconds === -1) {
            this._logger.warn(
              `Payment ${paymentId} timeout key exists without TTL, expiring to avoid dangling session.`,
            );
          }

          const lockKey = this.lockKey(paymentId);
          if (!(await this._cache.lock(lockKey, this.LOCK_TTL_MS))) {
            this._logger.warn(
              `Timeout for payment ${paymentId} already handled by another worker.`,
            );
            return;
          }
          try {
            // Might have been rescheduled seconds earlier (race condition)
            if (await this._cache.exists(timeoutKey)) {
              this._logger.debug(
                `Payment ${paymentId} was rescheduled. Skipping expiration.`,
              );
              return;
            }
            if (await this.finalizeTimeout(paymentId)) {
              await this._cache.del(timeoutKey);
            }
          } finally {
            await this._cache.unlock(lockKey);
          }
        } catch (error) {
          this._logger.warn(
            'Error while executing HandlePaymentTimeoutUseCase',
            { error, ctx: HandlePaymentTimeoutUseCase.name },
          );
        }
      },
    );
  }

  private async finalizeTimeout(paymentId: string): Promise<boolean> {
    return this._tracer.startActiveSpan(
      'HandlePaymentTimeoutUseCase.finalizeTimeout',
      async (span) => {
        span.setAttribute('payment.id', paymentId);

        this._logger.debug(`Evaluating timeout for payment ${paymentId}`);
        const payment = await this._paymentRepository.findById(paymentId);
        if (!payment) {
          this._logger.error(`Payment ${paymentId} not found`);
          return false;
        }
        if (payment.status !== PaymentStatus.PENDING) {
          this._logger.debug(
            `Payment ${paymentId} already finalized: ${payment.status}`,
          );
          return false;
        }
        if (!payment.expiresAt) {
          this._logger.warn(`Payment ${paymentId} has no expiresAt. Skipping.`);
          return false;
        }
        if (payment.expiresAt > new Date()) {
          this._logger.debug(
            `Payment ${paymentId} not expired yet. Re-scheduling.`,
          );
          await this.rescheduleTimeout(payment);
          return false;
        }

        payment.markExpired();
        await this._paymentRepository.save(payment);
        this._logger.warn(`Payment ${paymentId} EXPIRED`);

        const providerSession = payment.getSessionByProviderSessionId(
          payment.providerOrderId!,
        );
        providerSession?.updateStatus(ProviderSessionStatus.FAILED);

        await this._kafkaProducer.produce<OrderPaymentTimeoutEvent>(
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

        this._metrics.incPaymentCounter({
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
      this._logger.warn(
        `Cannot reschedule timeout for payment ${payment.id}: expiresAt missing.`,
      );
      return;
    }
    const ttl = payment.expiresAt.getTime() - Date.now();
    if (ttl <= 0) {
      this._logger.warn(
        `Payment ${payment.id} already expired, not re-scheduling.`,
      );
      return;
    }
    const timeoutKey = this.timeoutKey(payment.id);
    await this._cache.set(
      timeoutKey,
      JSON.stringify({
        paymentId: payment.id,
        expiresAt: payment.expiresAt.toISOString(),
        orderId: payment.orderId,
        userId: payment.userId,
      }),
      Math.ceil(ttl / 1000),
    );
    this._logger.debug(
      `Rescheduled timeout for payment ${payment.id}; TTL=${Math.ceil(ttl / 1000)}s.`,
    );
  }
}
