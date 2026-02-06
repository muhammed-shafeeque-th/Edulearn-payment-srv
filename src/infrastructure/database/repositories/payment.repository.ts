import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
import { IPaymentRepository } from '@domain/repositories/payment-repository.interface';
import { Money } from '@domain/value-objects/money';
import { IdempotencyKey } from '@domain/value-objects/idempotency-key';
import { PaymentEntity } from '@infrastructure/database/entities/payment.entity';
import { ICacheService } from '@application/adaptors/redis.interface';
import { TracingService } from '@infrastructure/observability/tracing/trace.service';
import { LoggingService } from '@infrastructure/observability/logging/logging.service';
import {
  Payment,
  PaymentProvider,
  PaymentStatus,
} from '@domain/entities/payments';
import { MetricsService } from '@infrastructure/observability/metrics/metrics.service';
import { PaymentProviderSessionEntity } from '../entities/payment-provider-session.entity';
import {
  PaymentProviderSession,
  ProviderSessionStatus,
} from '@domain/entities/payment-provider-sesssion.entity';
import { PaymentProviderRefundEntity } from '../entities/payment_provider_refund.entity';
import {
  PaymentProviderRefund,
  ProviderRefundStatus,
} from '@domain/entities/refund-provider.entity';

@Injectable()
export class PaymentTypeOrmRepository implements IPaymentRepository {
  private readonly CACHE_TTL = 3600;

  constructor(
    @InjectRepository(PaymentEntity)
    private readonly paymentRepo: Repository<PaymentEntity>,

    @InjectRepository(PaymentProviderSessionEntity)
    private readonly sessionRepo: Repository<PaymentProviderSessionEntity>,

    // @InjectRepository(PaymentProviderRefundEntity)
    // private readonly refundRepo: Repository<PaymentProviderRefundEntity>,

    private readonly cache: ICacheService,
    private readonly logger: LoggingService,
    private readonly tracer: TracingService,
    private readonly metrics: MetricsService,
  ) {}

  async save(payment: Payment): Promise<void> {
    return await this.tracer.startActiveSpan(
      'PaymentTypeOrmRepository.save',
      async (span) => {
        span.setAttribute('payment.id', payment.id);

        try {
          const entity = this.toEntity(payment);
          await this.paymentRepo.save(entity);

          this.logger.debug(`Saved payment with ID ${payment.id}`, {
            ctx: 'PaymentTypeOrmRepository',
          });

          for (const session of payment.getProviderSessions()) {
            await this.sessionRepo.save(this.toSessionEntity(session));
          }

          const cacheKey = this.getPaymentCacheKey(payment.id);
          await this.cache.set(
            cacheKey,
            JSON.stringify(entity),
            this.CACHE_TTL,
          );
        } catch (error: any) {
          this.logger.error(`Failed to save payment: ${error.message}`, {
            error,
            ctx: 'PaymentTypeOrmRepository',
          });
          throw error;
        }
      },
    );
  }

  async findById(id: string): Promise<Payment | null> {
    return await this.tracer.startActiveSpan(
      'PaymentTypeOrmRepository.findById',
      async (span) => {
        span.setAttribute('payment.id', id);

        try {
          const cacheKey = this.getPaymentCacheKey(id);
          const cached = await this.cache.get(cacheKey);
          if (cached) {
            this.metrics.redisCacheHit({
              operation: 'findById',
              status: 'hit',
            });
            this.logger.debug(`Cache hit for payment ${id}`, {
              ctx: 'PaymentTypeOrmRepository',
            });
            const parsed = JSON.parse(cached);
            return this.toDomain(parsed);
          }
          this.metrics.redisCacheHit({ operation: 'findById', status: 'miss' });
          const end = this.metrics.observeDatabaseQueryLatency({
            operation: 'findById',
          });
          const entity = await this.paymentRepo.findOne({
            where: { id },
            relations: ['providerSessions', 'providerSessions.refund'],
          });
          end();
          if (!entity) return null;
          await this.cache.set(
            cacheKey,
            JSON.stringify(entity),
            this.CACHE_TTL,
          );
          return this.toDomain(entity);
        } catch (error: any) {
          this.logger.error(
            `Failed to find payment by ID ${id}: ${error.message}`,
            { error, ctx: 'PaymentTypeOrmRepository' },
          );
          throw error;
        }
      },
    );
  }

  async findExpiredPendingPayments(
    now: Date,
    limit: number,
  ): Promise<Payment[]> {
    return await this.tracer.startActiveSpan(
      'PaymentTypeOrmRepository.findExpiredPendingPayments',
      async (span) => {
        span.setAttribute('now', now.toISOString());
        span.setAttribute('limit', limit);

        try {
          const end = this.metrics.observeDatabaseQueryLatency({
            operation: 'findExpiredPendingPayments',
          });

          const entities = await this.paymentRepo.find({
            where: {
              status: PaymentStatus.PENDING,
              expiresAt: LessThanOrEqual(now),
            },
            order: { expiresAt: 'ASC' },
            take: limit,
            relations: ['providerSessions', 'providerSessions.refund'],
          });

          end();

          return entities.map((entity) => this.toDomain(entity));
        } catch (error: any) {
          this.logger.error(
            `Failed to find expired pending payments: ${error.message}`,
            { error, ctx: 'PaymentTypeOrmRepository' },
          );
          throw error;
        }
      },
    );
  }

  async findByProviderOrderId(
    providerOrderId: string,
  ): Promise<Payment | null> {
    return await this.tracer.startActiveSpan(
      'PaymentTypeOrmRepository.findByProviderOrderId',
      async (span) => {
        span.setAttribute('provider.orderId', providerOrderId);

        try {
          const cacheKey = this.getProviderOrderCacheKey(providerOrderId);
          const cached = await this.cache.get(cacheKey);
          if (cached) {
            this.metrics.redisCacheHit({
              operation: 'findByProviderOrderId',
              status: 'hit',
            });
            this.logger.debug(
              `Cache hit for provider order ${providerOrderId}`,
              {
                ctx: 'PaymentTypeOrmRepository',
              },
            );
            const parsed = JSON.parse(cached);
            return this.toDomain(parsed);
          }
          this.metrics.redisCacheHit({
            operation: 'findByProviderOrderId',
            status: 'miss',
          });

          const end = this.metrics.observeDatabaseQueryLatency({
            operation: 'findByProviderOrderId',
          });
          const entity = await this.paymentRepo.findOne({
            where: { providerOrderId },
            relations: ['providerSessions', 'providerSessions.refund'],
          });
          end();
          if (!entity) return null;
          await this.cache.set(
            cacheKey,
            JSON.stringify(entity),
            this.CACHE_TTL,
          );
          return this.toDomain(entity);
        } catch (error: any) {
          this.logger.error(
            `Failed to find payment by provider order id ${providerOrderId}: ${error.message}`,
            { error, ctx: 'PaymentTypeOrmRepository' },
          );
          throw error;
        }
      },
    );
  }

  async findPaymentWithSessions(paymentId: string): Promise<Payment | null> {
    try {
      const cacheKey = this.getPaymentCacheKey(paymentId);
      const cached = await this.cache.get(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        return this.toDomain(parsed);
      }
      const entity = await this.paymentRepo.findOne({
        where: { id: paymentId },
        relations: ['providerSessions', 'providerSessions.refund'],
      });
      if (!entity) return null;
      await this.cache.set(cacheKey, JSON.stringify(entity), this.CACHE_TTL);
      return this.toDomain(entity);
    } catch (error: any) {
      this.logger.error(
        `Failed to find payment with sessions for ID ${paymentId}: ${error.message}`,
        { error, ctx: 'PaymentTypeOrmRepository' },
      );
      throw error;
    }
  }

  async findByIdempotencyKey(idempotencyKey: string): Promise<Payment | null> {
    return await this.tracer.startActiveSpan(
      'PaymentTypeOrmRepository.findByIdempotencyKey',
      async (span) => {
        span.setAttribute('idempotency.key', idempotencyKey);
        try {
          const cacheKey = this.getIdempotencyCacheKey(idempotencyKey);
          const cached = await this.cache.get(cacheKey);
          if (cached) {
            this.metrics.redisCacheHit({
              operation: 'findByIdempotencyKey',
              status: 'hit',
            });
            this.logger.debug(
              `Cache hit for payment idempotency key ${idempotencyKey}`,
              { ctx: 'PaymentTypeOrmRepository' },
            );
            const parsed = JSON.parse(cached);
            return this.toDomain(parsed);
          }
          this.metrics.redisCacheHit({
            operation: 'findByIdempotencyKey',
            status: 'miss',
          });

          const end = this.metrics.observeDatabaseQueryLatency({
            operation: 'findByIdempotencyKey',
          });
          const entity = await this.paymentRepo.findOne({
            where: { idempotencyKey },
            relations: ['providerSessions', 'providerSessions.refund'],
          });
          end();
          if (!entity) return null;
          await this.cache.set(
            cacheKey,
            JSON.stringify(entity),
            this.CACHE_TTL,
          );
          return this.toDomain(entity);
        } catch (error: any) {
          this.logger.error(
            `Failed to find payment by idempotency key ${idempotencyKey}: ${error.message}`,
            { error, ctx: 'PaymentTypeOrmRepository' },
          );
          throw error;
        }
      },
    );
  }

  async update(payment: Payment): Promise<void> {
    return await this.tracer.startActiveSpan(
      'PaymentTypeOrmRepository.update',
      async (span) => {
        span.setAttribute('payment.id', payment.id);
        try {
          const entity = this.toEntity(payment);
          await this.paymentRepo.save(entity);

          this.logger.debug(`Updated payment with ID ${payment.id}`, {
            ctx: 'PaymentTypeOrmRepository',
          });

          const cacheKey = this.getPaymentCacheKey(payment.id);
          await this.cache.set(
            cacheKey,
            JSON.stringify(entity),
            this.CACHE_TTL,
          );

          if (payment.idempotencyKey && payment.idempotencyKey.getValue()) {
            const idempotencyKey = payment.idempotencyKey.getValue();
            const idempotencyCacheKey =
              this.getIdempotencyCacheKey(idempotencyKey);
            await this.cache.set(
              idempotencyCacheKey,
              JSON.stringify(entity),
              this.CACHE_TTL,
            );
          }
        } catch (error: any) {
          this.logger.error(`Failed to update payment: ${error.message}`, {
            error,
            ctx: 'PaymentTypeOrmRepository',
          });
          throw error;
        }
      },
    );
  }

  async findByStatus(status: PaymentStatus): Promise<Payment[]> {
    return await this.tracer.startActiveSpan(
      'PaymentTypeOrmRepository.findByStatus',
      async (span) => {
        span.setAttribute('payment.status', status);
        try {
          const entities = await this.paymentRepo.find({
            where: { status },
            relations: ['providerSessions', 'providerSessions.refund'],
          });
          return entities.map((entity) => this.toDomain(entity));
        } catch (error: any) {
          this.logger.error(
            `Failed to find payments by status ${status}: ${error.message}`,
            { error, ctx: 'PaymentTypeOrmRepository' },
          );
          throw error;
        }
      },
    );
  }

  async updateProviderSession(session: PaymentProviderSession): Promise<void> {
    try {
      const entity = this.toSessionEntity(session);
      await this.sessionRepo.update({ id: session.id }, entity);
      this.logger.debug(`Updated provider session with ID ${session.id}`, {
        ctx: 'PaymentTypeOrmRepository',
      });
    } catch (error: any) {
      this.logger.error(`Failed to update provider session: ${error.message}`, {
        error,
        ctx: 'PaymentTypeOrmRepository',
      });
      throw error;
    }
  }

  async invalidateCache(key: string): Promise<void> {
    try {
      await this.cache.del(key);
      this.logger.debug(`Invalidated cache for key ${key}`, {
        ctx: 'PaymentTypeOrmRepository',
      });
    } catch (error: any) {
      this.logger.error(`Failed to invalidate cache: ${error.message}`, {
        error,
        ctx: 'PaymentTypeOrmRepository',
      });
      throw error;
    }
  }

  async deleteById(id: string): Promise<void> {
    return await this.tracer.startActiveSpan(
      'PaymentTypeOrmRepository.deleteById',
      async (span) => {
        span.setAttribute('payment.id', id);
        try {
          await this.paymentRepo.delete({ id });
          const cacheKey = this.getPaymentCacheKey(id);
          await this.cache.del(cacheKey);
          this.logger.debug(`Deleted payment with ID ${id}`, {
            ctx: 'PaymentTypeOrmRepository',
          });
        } catch (error: any) {
          this.logger.error(
            `Failed to delete payment by ID ${id}: ${error.message}`,
            { error, ctx: 'PaymentTypeOrmRepository' },
          );
          throw error;
        }
      },
    );
  }

  private getPaymentCacheKey(id: string): string {
    return `cache:payment:${id}`;
  }
  private getIdempotencyCacheKey(key: string): string {
    return `cache:payment:idempotency:${key}`;
  }
  private getProviderOrderCacheKey(orderId: string): string {
    return `cache:payment:provider_order_id:${orderId}`;
  }

  private toEntity(payment: Payment): PaymentEntity {
    const entity = new PaymentEntity();
    entity.id = payment.id;
    entity.userId = payment.userId;
    entity.orderId = payment.orderId;
    entity.amount = payment.amount.getAmount();
    entity.currency = payment.amount.getCurrency();
    entity.status = payment.status;
    entity.idempotencyKey = payment.idempotencyKey.getValue();
    entity.providerOrderId = payment.providerOrderId;
    entity.expiresAt = payment.expiresAt;
    entity.createdAt = payment.createdAt;
    entity.updatedAt = payment.updatedAt;

    entity.providerSessions = payment.getProviderSessions()
      ? payment.getProviderSessions().map((s) => this.toSessionEntity(s))
      : [];
    return entity;
  }

  private toSessionEntity(
    session: PaymentProviderSession,
  ): PaymentProviderSessionEntity {
    const entity = new PaymentProviderSessionEntity();
    entity.id = session.id;
    entity.paymentId = session.paymentId;
    entity.provider = session.provider;
    entity.providerOrderId = session.providerOrderId;
    entity.providerPaymentId = session.providerPaymentId;
    entity.providerAmount = session.providerAmount;
    entity.providerCurrency = session.providerCurrency;
    entity.fxRate = session.fxRate;
    entity.fxTimestamp = session.fxTimestamp;
    entity.status = session.status;
    entity.metadata = session.metadata;
    entity.createdAt = session.createdAt;
    entity.updatedAt = session.updatedAt;
    entity.refund =
      session.refund && session.refund instanceof PaymentProviderRefund
        ? this.toRefundEntity(session.refund)
        : undefined;
    return entity;
  }

  private toRefundEntity(
    refund: PaymentProviderRefund,
  ): PaymentProviderRefundEntity {
    const entity = new PaymentProviderRefundEntity();
    entity.id = refund.id;
    entity.paymentId = refund.paymentId;
    entity.status = refund.status;
    entity.metadata = refund.metadata;
    entity.createdAt = refund.createdAt;
    entity.updatedAt = refund.updatedAt;
    entity.providerFee = refund.providerFee;
    entity.providerSessionId = refund.providerSessionId;
    entity.requestedAmount = refund.requestedAmount;
    entity.requestedCurrency = refund.requestedCurrency;
    entity.idempotencyKey = refund.idempotencyKey;
    entity.providerRefundId = refund.providerRefundId;
    return entity;
  }

  private toDomain(entity: PaymentEntity): Payment {
    const payment = Payment.create(
      entity.userId,
      entity.orderId,
      new Money(entity.amount, entity.currency),
      new IdempotencyKey(entity.idempotencyKey),
      entity.expiresAt,
    );

    payment.setId(entity.id);
    payment.setStatus(entity.status as PaymentStatus);
    payment.setProviderOrderId(entity.providerOrderId!);
    payment.setCreatedAt(entity.createdAt);
    payment.setUpdatedAt(entity.updatedAt);

    for (const session of entity.providerSessions ?? []) {
      const domainSession = new PaymentProviderSession({
        id: session.id,
        paymentId: session.paymentId,
        provider: session.provider as PaymentProvider,
        providerOrderId: session.providerOrderId,
        providerPaymentId: session.providerPaymentId,
        providerAmount: session.providerAmount,
        providerCurrency: session.providerCurrency,
        fxRate: session.fxRate,
        fxTimestamp: session.fxTimestamp,
        status: session.status as ProviderSessionStatus,
        metadata: session.metadata,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
      });

      if (session.refund) {
        const sRefund = session.refund;
        const domainRefund = new PaymentProviderRefund({
          id: sRefund.id,
          paymentId: sRefund.paymentId,
          providerSessionId: sRefund.providerSessionId,
          requestedAmount: sRefund.requestedAmount,
          idempotencyKey: sRefund.idempotencyKey,
          requestedCurrency: sRefund.requestedCurrency,
          metadata: sRefund.metadata,
          providerRefundId: sRefund.providerRefundId,
          status: sRefund.status as ProviderRefundStatus,
        });
        if (sRefund.createdAt) domainRefund.setCreatedAt(sRefund.createdAt);
        if (sRefund.updatedAt) domainRefund.setUpdatedAt(sRefund.updatedAt);
        domainSession.setRefund(domainRefund);
      }

      payment.addProviderSession(domainSession);
    }

    return payment;
  }
}
