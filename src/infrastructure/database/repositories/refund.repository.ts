import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Refund, RefundStatus } from '@domain/entities/refund';
import { IRefundRepository } from '@domain/interfaces/refund-repository.interface';
import { Money } from '@domain/value-objects/money';
import { IdempotencyKey } from '@domain/value-objects/idempotency-key';
import { RefundEntity } from '@infrastructure/database/entities/refund.entity';
import { IRedisClient } from '@domain/interfaces/redis.interface';
import { TracingService } from '@infrastructure/observability/tracing/trace.service';
import { LoggingService } from '@infrastructure/observability/logging/logging.service';

@Injectable()
export class RefundTypeOrmRepository implements IRefundRepository {
  private readonly CACHE_TTL = 3600; // 1 hour

  constructor(
    @InjectRepository(RefundEntity)
    private readonly repo: Repository<RefundEntity>,
    private readonly redis: IRedisClient,
    private readonly logger: LoggingService,
    private readonly tracer: TracingService,
  ) {}

  async save(refund: Refund): Promise<void> {
    return await this.tracer.startActiveSpan(
      'RefundRepository.save',
      async (span) => {
        span.setAttributes({
          'refund.id': refund.getId(),
          'refund.transaction.id': refund.getTransactionId(),
        });
        try {
          const entity = this.toEntity(refund);
          await this.repo.save(entity);
          this.logger.log(`Saved refund with ID ${refund.getId()}`, {
            ctx: 'RefundRepository',
          });

          const cacheKey = `cache:refund:${refund.getId()}`;
          await this.redis.set(
            cacheKey,
            JSON.stringify(entity),
            this.CACHE_TTL,
          );
        } catch (error: any) {
          this.logger.error(`Failed to save refund: ${error.message}`, {
            error,
            ctx: 'RefundRepository',
          });
          throw error;
        }
      },
    );
  }

  async findById(id: string): Promise<Refund | null> {
    return await this.tracer.startActiveSpan(
      'RefundRepository.findById',
      async (span) => {
        span.setAttribute('refund.id', id);
        try {
          const cacheKey = `cache:refund:${id}`;
          const cached = await this.redis.get(cacheKey);
          if (cached) {
            this.logger.log(`Cache hit for refund ${id}`, {
              ctx: 'RefundRepository',
            });
            const entity = JSON.parse(cached);
            return this.toDomain(entity);
          }

          const entity = await this.repo.findOne({ where: { id } });
          if (!entity) return null;

          await this.redis.set(
            cacheKey,
            JSON.stringify(entity),
            this.CACHE_TTL,
          );
          return this.toDomain(entity);
        } catch (error: any) {
          this.logger.error(
            `Failed to find refund by ID ${id}: ${error.message}`,
            { error, ctx: 'RefundRepository' },
          );
          throw error;
        }
      },
    );
  }

  async findByIdempotencyKey(idempotencyKey: string): Promise<Refund | null> {
    return await this.tracer.startActiveSpan(
      'RefundRepository.findByIdempotencyKey',
      async (span) => {
        span.setAttribute('idempotency.key', idempotencyKey);
        try {
          const cacheKey = `cache:refund:idempotency:${idempotencyKey}`;
          const cached = await this.redis.get(cacheKey);
          if (cached) {
            this.logger.log(
              `Cache hit for refund idempotency ${idempotencyKey}`,
              { ctx: 'RefundRepository' },
            );
            const entity = JSON.parse(cached);
            return this.toDomain(entity);
          }

          const entity = await this.repo.findOne({ where: { idempotencyKey } });
          if (!entity) return null;

          await this.redis.set(
            cacheKey,
            JSON.stringify(entity),
            this.CACHE_TTL,
          );
          return this.toDomain(entity);
        } catch (error: any) {
          this.logger.error(
            `Failed to find refund by idempotency key ${idempotencyKey}: ${error.message}`,
            { error, ctx: 'RefundRepository' },
          );
          throw error;
        }
      },
    );
  }

  async update(refund: Refund): Promise<void> {
    return await this.tracer.startActiveSpan(
      'RefundRepository.update',
      async (span) => {
        span.setAttributes({
          'refund.id': refund.getId(),
          'refund.transaction.id': refund.getTransactionId(),
        });
        try {
          const entity = this.toEntity(refund);
          await this.repo.update({ id: refund.getId() }, entity);
          this.logger.log(`Updated refund with ID ${refund.getId()}`, {
            ctx: 'RefundRepository',
          });

          const cacheKey = `cache:refund:${refund.getId()}`;
          await this.redis.set(
            cacheKey,
            JSON.stringify(entity),
            this.CACHE_TTL,
          );

          const idempotencyCacheKey = `cache:refund:idempotency:${refund.getIdempotencyKey().getValue()}`;
          await this.redis.set(
            idempotencyCacheKey,
            JSON.stringify(entity),
            this.CACHE_TTL,
          );
        } catch (error: any) {
          this.logger.error(`Failed to update refund: ${error.message}`, {
            error,
            ctx: 'RefundRepository',
          });
          throw error;
        }
      },
    );
  }

  async invalidateCache(key: string): Promise<void> {
    await this.redis.del(key);
    this.logger.log(`Invalidated cache for key ${key}`, {
      ctx: 'RefundRepository',
    });
  }

  private toEntity(refund: Refund): RefundEntity {
    const entity = new RefundEntity();
    entity.id = refund.getId();
    entity.paymentId = refund.getPaymentId();
    entity.userId = refund.getUserId();
    const amount = refund.getAmount();
    entity.amount = amount.getAmount();
    entity.currency = amount.getCurrency();
    entity.status = refund.getStatus();
    entity.idempotencyKey = refund.getIdempotencyKey().getValue();
    entity.reason = refund.getReason();
    entity.transactionId = refund.getTransactionId();
    entity.createdAt = refund.getCreatedAt();
    entity.updatedAt = refund.getUpdatedAt();
    return entity;
  }

  private toDomain(entity: RefundEntity): Refund {
    const money = new Money(entity.amount, entity.currency);
    const idempotencyKey = new IdempotencyKey(entity.idempotencyKey);
    const refund = Refund.create(
      entity.paymentId,
      entity.userId,
      money,
      idempotencyKey,
      entity.reason,
    );
    refund.setId(entity.id);
    refund.setStatus(entity.status as RefundStatus);
    refund.setTransactionId(entity.transactionId!);
    refund.setCreatedAt(entity.createdAt);
    refund.setUpdatedAt(entity.updatedAt);
    return refund;
  }
}
