import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IRefundRepository } from '@domain/repositories/refund-repository.interface';
import { ICacheService } from '@application/ports/redis.interface';
import { PaymentProviderRefundEntity } from '../entities/payment_provider_refund.entity';
import {
  PaymentProviderRefund,
  ProviderRefundStatus,
} from '@domain/entities/refund-provider.entity';
import { ILoggerService } from '@application/ports/logger.service';
import { ITraceService } from '@application/ports/trace.service';

@Injectable()
export class RefundTypeOrmRepository implements IRefundRepository {
  private readonly CACHE_TTL = 3600; // 1 hour

  constructor(
    @InjectRepository(PaymentProviderRefundEntity)
    private readonly _repo: Repository<PaymentProviderRefundEntity>,
    private readonly redis: ICacheService,
    private readonly _logger: ILoggerService,
    private readonly _tracer: ITraceService,
  ) {}

  async save(refund: PaymentProviderRefund): Promise<void> {
    return await this._tracer.startActiveSpan(
      'RefundRepository.save',
      async (span) => {
        span.setAttributes({
          'refund.id': refund.id,
          'refund.transaction.id': refund.providerSessionId,
        });
        try {
          const entity = this.toEntity(refund);
          await this._repo.save(entity);
          this._logger.debug(`Saved refund with ID ${refund.id}`, {
            ctx: 'RefundRepository',
          });

          const cacheKey = `cache:refund:${refund.id}`;
          await this.redis.set(
            cacheKey,
            JSON.stringify(entity),
            this.CACHE_TTL,
          );
        } catch (error: any) {
          this._logger.error(`Failed to save refund: ${error.message}`, {
            error,
            ctx: 'RefundRepository',
          });
          throw error;
        }
      },
    );
  }

  async findById(id: string): Promise<PaymentProviderRefund | null> {
    return await this._tracer.startActiveSpan(
      'RefundRepository.findById',
      async (span) => {
        span.setAttribute('refund.id', id);
        try {
          const cacheKey = `cache:refund:${id}`;
          const cached = await this.redis.get(cacheKey);
          if (cached) {
            this._logger.debug(`Cache hit for refund ${id}`, {
              ctx: 'RefundRepository',
            });
            const entity = JSON.parse(cached);
            return this.toDomain(entity);
          }

          const entity = await this._repo.findOne({ where: { id } });
          if (!entity) return null;

          await this.redis.set(
            cacheKey,
            JSON.stringify(entity),
            this.CACHE_TTL,
          );
          return this.toDomain(entity);
        } catch (error: any) {
          this._logger.error(
            `Failed to find refund by ID ${id}: ${error.message}`,
            { error, ctx: 'RefundRepository' },
          );
          throw error;
        }
      },
    );
  }

  async findByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<PaymentProviderRefund | null> {
    return await this._tracer.startActiveSpan(
      'RefundRepository.findByIdempotencyKey',
      async (span) => {
        span.setAttribute('idempotency.key', idempotencyKey);
        try {
          const cacheKey = `cache:refund:idempotency:${idempotencyKey}`;
          const cached = await this.redis.get(cacheKey);
          if (cached) {
            this._logger.debug(
              `Cache hit for refund idempotency ${idempotencyKey}`,
              { ctx: 'RefundRepository' },
            );
            const entity = JSON.parse(cached);
            return this.toDomain(entity);
          }

          const entity = await this._repo.findOne({
            where: { idempotencyKey },
          });
          if (!entity) return null;

          await this.redis.set(
            cacheKey,
            JSON.stringify(entity),
            this.CACHE_TTL,
          );
          return this.toDomain(entity);
        } catch (error: any) {
          this._logger.error(
            `Failed to find refund by idempotency key ${idempotencyKey}: ${error.message}`,
            { error, ctx: 'RefundRepository' },
          );
          throw error;
        }
      },
    );
  }

  async update(refund: PaymentProviderRefund): Promise<void> {
    return await this._tracer.startActiveSpan(
      'RefundRepository.update',
      async (span) => {
        span.setAttributes({
          'refund.id': refund.id,
          'refund.transaction.id': refund.providerSessionId,
        });
        try {
          const entity = this.toEntity(refund);
          await this._repo.update({ id: refund.id }, entity);
          this._logger.debug(`Updated refund with ID ${refund.id}`, {
            ctx: 'RefundRepository',
          });

          const cacheKey = `cache:refund:${refund.id}`;
          await this.redis.set(
            cacheKey,
            JSON.stringify(entity),
            this.CACHE_TTL,
          );

          const idempotencyCacheKey = `cache:refund:idempotency:${refund.idempotencyKey}`;
          await this.redis.set(
            idempotencyCacheKey,
            JSON.stringify(entity),
            this.CACHE_TTL,
          );
        } catch (error: any) {
          this._logger.error(`Failed to update refund: ${error.message}`, {
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
    this._logger.debug(`Invalidated cache for key ${key}`, {
      ctx: 'RefundRepository',
    });
  }

  private toEntity(refund: PaymentProviderRefund): PaymentProviderRefundEntity {
    const entity = new PaymentProviderRefundEntity();
    entity.id = refund.id;
    entity.createdAt = refund.createdAt;
    entity.idempotencyKey = refund.idempotencyKey;
    entity.paymentId = refund.paymentId;
    entity.providerFee = refund.providerFee;
    entity.providerRefundId = refund.providerRefundId;
    entity.providerSessionId = refund.providerSessionId;
    entity.requestedAmount = refund.requestedAmount;
    entity.requestedCurrency = refund.requestedCurrency;
    entity.status = refund.status;
    entity.metadata = refund.metadata;
    entity.updatedAt = refund.updatedAt;
    return entity;
  }

  private toDomain(entity: PaymentProviderRefundEntity): PaymentProviderRefund {
    const refund = new PaymentProviderRefund({
      id: entity.id,
      idempotencyKey: entity.idempotencyKey,
      paymentId: entity.paymentId,
      providerSessionId: entity.providerSessionId,
      requestedAmount: entity.requestedAmount,
      requestedCurrency: entity.requestedCurrency,
      metadata: entity.metadata,
      providerRefundId: entity.providerRefundId,
      status: entity.status as ProviderRefundStatus,
    });
    refund.setCreatedAt(entity.createdAt);
    refund.setUpdatedAt(entity.updatedAt);
    return refund;
  }
}
