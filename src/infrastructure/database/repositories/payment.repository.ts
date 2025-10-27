import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IPaymentRepository } from '@domain/interfaces/payment-repository.interface';
import { Money } from '@domain/value-objects/money';
import { IdempotencyKey } from '@domain/value-objects/idempotency-key';
import { PaymentEntity } from '@infrastructure/database/entities/payment.entity';
import { IRedisClient } from '@domain/interfaces/redis.interface';
import { TracingService } from '@infrastructure/observability/tracing/trace.service';
import { LoggingService } from '@infrastructure/observability/logging/logging.service';
import {
  Payment,
  PaymentGateway,
  PaymentStatus,
} from '@domain/entities/payments';
import { MetricsService } from '@infrastructure/observability/metrics/metrics.service';

@Injectable()
export class PaymentTypeOrmRepository implements IPaymentRepository {
  private readonly CACHE_TTL = 3600; // 1 hour

  constructor(
    @InjectRepository(PaymentEntity)
    private readonly repo: Repository<PaymentEntity>,
    private readonly redis: IRedisClient,
    private readonly logger: LoggingService,
    private readonly tracer: TracingService,
    private readonly metrics: MetricsService,
  ) {}

  async save(payment: Payment): Promise<void> {
    return await this.tracer.startActiveSpan(
      'PaymentTypeOrmRepository.save',
      async (span) => {
        span.setAttributes({
          'payment.id': payment.getId(),
          'payment.gateway': payment.getPaymentGateway(),
        });
        try {
          const entity = this.toEntity(payment);
          await this.repo.save(entity);
          this.logger.log(`Saved payment with ID ${payment.getId()}`, {
            ctx: 'PaymentTypeOrmRepository',
          });

          // Cache the payment
          const cacheKey = `cache:payment:${payment.getId()}`;
          await this.redis.set(
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
          const cacheKey = `cache:payment:${id}`;
          const cached = await this.redis.get(cacheKey);
          if (cached) {
            this.metrics.redisCacheHit({
              operation: 'findById',
              status: 'hit',
            });
            this.logger.log(`Cache hit for payment ${id}`, {
              ctx: 'PaymentTypeOrmRepository',
            });
            const entity = JSON.parse(cached);
            return this.toDomain(entity);
          }

          this.metrics.redisCacheHit({
            operation: 'findById',
            status: 'miss',
          });

          const end = this.metrics.observeDatabaseQueryLatency({
            operation: 'findById',
          });
          const entity = await this.repo.findOne({ where: { id } });
          end();
          if (!entity) {
            return null;
          }

          await this.redis.set(
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
  async findByProviderOrderId(
    providerOrderId: string,
  ): Promise<Payment | null> {
    return await this.tracer.startActiveSpan(
      'findByProviderOrderId.findById',
      async (span) => {
        span.setAttribute('payment.id', providerOrderId);
        try {
          const cacheKey = `cache:payment:provider_order_id:${providerOrderId}`;
          const cached = await this.redis.get(cacheKey);
          if (cached) {
            this.metrics.redisCacheHit({
              operation: 'findById',
              status: 'hit',
            });
            this.logger.log(`Cache hit for provider order ${providerOrderId}`, {
              ctx: 'findByProviderOrderId',
            });
            const entity = JSON.parse(cached);
            return this.toDomain(entity);
          }

          this.metrics.redisCacheHit({
            operation: 'findByProviderOrderId',
            status: 'miss',
          });

          const end = this.metrics.observeDatabaseQueryLatency({
            operation: 'findByProviderOrderId',
          });
          const entity = await this.repo.findOne({
            where: { providerOrderId },
          });
          end();
          if (!entity) {
            return null;
          }

          await this.redis.set(
            cacheKey,
            JSON.stringify(entity),
            this.CACHE_TTL,
          );
          return this.toDomain(entity);
        } catch (error: any) {
          this.logger.error(
            `Failed to find payment by provider order Id ${providerOrderId}: ${error.message}`,
            { error, ctx: 'findByProviderOrderId' },
          );
          throw error;
        }
      },
    );
  }

  async findByIdempotencyKey(idempotencyKey: string): Promise<Payment | null> {
    return await this.tracer.startActiveSpan(
      'PaymentTypeOrmRepository.findByIdempotencyKey',
      async (span) => {
        span.setAttribute('idempotency.key', idempotencyKey);
        try {
          const cacheKey = `cache:payment:idempotency:${idempotencyKey}`;
          const cached = await this.redis.get(cacheKey);
          if (cached) {
            this.metrics.redisCacheHit({
              operation: 'findByIdempotencyKey',
              status: 'hit',
            });
            this.logger.log(
              `Cache hit for payment idempotency ${idempotencyKey}`,
              { ctx: 'PaymentTypeOrmRepository' },
            );
            const entity = JSON.parse(cached);
            return this.toDomain(entity);
          }
          this.metrics.redisCacheHit({
            operation: 'findByIdempotencyKey',
            status: 'miss',
          });
          const end = this.metrics.observeDatabaseQueryLatency({
            operation: 'findByIdempotencyKey',
          });
          const entity = await this.repo.findOne({ where: { idempotencyKey } });
          end();
          if (!entity) return null;

          await this.redis.set(
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
        span.setAttributes({
          'payment.id': payment.getId(),
          'payment.gateway': payment.getPaymentGateway(),
        });
        try {
          const entity = this.toEntity(payment);
          await this.repo.update({ id: payment.getId() }, entity);
          this.logger.log(`Updated payment with ID ${payment.getId()}`, {
            ctx: 'PaymentTypeOrmRepository',
          });

          // Update cache
          const cacheKey = `cache:payment:${payment.getId()}`;
          await this.redis.set(
            cacheKey,
            JSON.stringify(entity),
            this.CACHE_TTL,
          );

          const idempotencyCacheKey = `cache:payment:idempotency:${payment.getIdempotencyKey().getValue()}`;
          await this.redis.set(
            idempotencyCacheKey,
            JSON.stringify(entity),
            this.CACHE_TTL,
          );
        } catch (error: any) {
          this.logger.error(`Failed to update payment: ${error.message}`, {
            error,
            ctx: 'PaymentTypeOrmRepository',
          });
          throw error;
        } finally {
          span.end();
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
          const entities = await this.repo.find({ where: { status } });
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

  async invalidateCache(key: string): Promise<void> {
    await this.redis.del(key);
    this.logger.log(`Invalidated cache for key ${key}`, {
      ctx: 'PaymentTypeOrmRepository',
    });
  }

  private toEntity(payment: Payment): PaymentEntity {
    const entity = new PaymentEntity();
    entity.id = payment.getId();
    entity.userId = payment.getUserId();
    entity.orderId = payment.getOrderId();
    const amount = payment.getAmount();
    entity.amount = amount.getAmount();
    entity.currency = amount.getCurrency();
    entity.status = payment.getStatus();
    entity.idempotencyKey = payment.getIdempotencyKey().getValue();
    entity.paymentGateway = payment.getPaymentGateway();
    entity.providerOrderId = payment.getProviderOrderId();
    entity.createdAt = payment.getCreatedAt();
    entity.updatedAt = payment.getUpdatedAt();
    return entity;
  }

  private toDomain(entity: PaymentEntity): Payment {
    const money = new Money(entity.amount, entity.currency);
    const idempotencyKey = new IdempotencyKey(entity.idempotencyKey);
    const payment = Payment.create(
      entity.userId,
      entity.orderId,
      money,
      idempotencyKey,
      entity.paymentGateway as PaymentGateway,
    );
    payment.setId(entity.id);
    payment.setStatus(entity.status as PaymentStatus);
    payment.setProviderOrderId(entity.providerOrderId!);
    payment.setCreatedAt(entity.createdAt);
    payment.setUpdatedAt(entity.updatedAt);
    return payment;
  }
}
