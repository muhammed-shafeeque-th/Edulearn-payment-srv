import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
import { IPaymentRepository } from '@domain/repositories/payment-repository.interface';
import { Money } from '@domain/value-objects/money';
import { IdempotencyKey } from '@domain/value-objects/idempotency-key';
import { PaymentEntity } from '@infrastructure/database/entities/payment.entity';
import {
  Payment,
  PaymentProvider,
  PaymentStatus,
} from '@domain/entities/payments';
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
import { ILoggerService } from '@application/ports/logger.service';
import { ITraceService } from '@application/ports/trace.service';
import { IMetricService } from '@application/ports/metric.service';

@Injectable()
export class PaymentTypeOrmRepository implements IPaymentRepository {
  constructor(
    @InjectRepository(PaymentEntity)
    private readonly _paymentRepo: Repository<PaymentEntity>,

    @InjectRepository(PaymentProviderSessionEntity)
    private readonly _sessionRepo: Repository<PaymentProviderSessionEntity>,

    // @InjectRepository(PaymentProviderRefundEntity)
    // private readonly refundRepo: Repository<PaymentProviderRefundEntity>,

    private readonly _logger: ILoggerService,
    private readonly _tracer: ITraceService,
    private readonly _metrics: IMetricService,
  ) {}

  async save(payment: Payment): Promise<void> {
    return await this._tracer.startActiveSpan(
      'PaymentTypeOrmRepository.save',
      async (span) => {
        span.setAttribute('payment.id', payment.id);

        try {
          const entity = this.toEntity(payment);
          await this._paymentRepo.save(entity);

          this._logger.debug(`Saved payment with ID ${payment.id}`, {
            ctx: 'PaymentTypeOrmRepository',
          });

          for (const session of payment.getProviderSessions()) {
            await this._sessionRepo.save(this.toSessionEntity(session));
          }
        } catch (error: any) {
          this._logger.error(`Failed to save payment: ${error.message}`, {
            error,
            ctx: 'PaymentTypeOrmRepository',
          });
          throw error;
        }
      },
    );
  }

  async findById(id: string): Promise<Payment | null> {
    return await this._tracer.startActiveSpan(
      'PaymentTypeOrmRepository.findById',
      async (span) => {
        span.setAttribute('payment.id', id);

        try {
          const end = this._metrics.observeDatabaseQueryLatency({
            operation: 'findById',
          });
          const entity = await this._paymentRepo.findOne({
            where: { id },
            relations: ['providerSessions', 'providerSessions.refund'],
          });
          end();
          if (!entity) return null;
          return this.toDomain(entity);
        } catch (error: any) {
          this._logger.error(
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
    return await this._tracer.startActiveSpan(
      'PaymentTypeOrmRepository.findExpiredPendingPayments',
      async (span) => {
        span.setAttribute('now', now.toISOString());
        span.setAttribute('limit', limit);

        try {
          const end = this._metrics.observeDatabaseQueryLatency({
            operation: 'findExpiredPendingPayments',
          });

          const entities = await this._paymentRepo.find({
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
          this._logger.error(
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
    return await this._tracer.startActiveSpan(
      'PaymentTypeOrmRepository.findByProviderOrderId',
      async (span) => {
        span.setAttribute('provider.orderId', providerOrderId);

        try {
          const end = this._metrics.observeDatabaseQueryLatency({
            operation: 'findByProviderOrderId',
          });
          const entity = await this._paymentRepo.findOne({
            where: { providerOrderId },
            relations: ['providerSessions', 'providerSessions.refund'],
          });
          end();
          if (!entity) return null;
          return this.toDomain(entity);
        } catch (error: any) {
          this._logger.error(
            `Failed to find payment by provider order id ${providerOrderId}: ${error.message}`,
            { error, ctx: 'PaymentTypeOrmRepository' },
          );
          throw error;
        }
      },
    );
  }
  async findByOrderId(orderId: string): Promise<Payment | null> {
    return await this._tracer.startActiveSpan(
      'PaymentTypeOrmRepository.findByProviderOrderId',
      async (span) => {
        span.setAttribute('provider.orderId', orderId);

        try {
          const end = this._metrics.observeDatabaseQueryLatency({
            operation: 'findByOrderId',
          });
          const entity = await this._paymentRepo.findOne({
            where: { orderId },
            relations: ['providerSessions', 'providerSessions.refund'],
          });
          end();
          if (!entity) return null;
          return this.toDomain(entity);
        } catch (error: any) {
          this._logger.error(
            `Failed to find payment by provider order id ${orderId}: ${error.message}`,
            { error, ctx: 'PaymentTypeOrmRepository' },
          );
          throw error;
        }
      },
    );
  }

  async findPaymentWithSessions(paymentId: string): Promise<Payment | null> {
    try {
      const entity = await this._paymentRepo.findOne({
        where: { id: paymentId },
        relations: ['providerSessions', 'providerSessions.refund'],
      });
      if (!entity) return null;
      return this.toDomain(entity);
    } catch (error: any) {
      this._logger.error(
        `Failed to find payment with sessions for ID ${paymentId}: ${error.message}`,
        { error, ctx: 'PaymentTypeOrmRepository' },
      );
      throw error;
    }
  }

  async findByIdempotencyKey(idempotencyKey: string): Promise<Payment | null> {
    return await this._tracer.startActiveSpan(
      'PaymentTypeOrmRepository.findByIdempotencyKey',
      async (span) => {
        span.setAttribute('idempotency.key', idempotencyKey);
        try {
          const end = this._metrics.observeDatabaseQueryLatency({
            operation: 'findByIdempotencyKey',
          });
          const entity = await this._paymentRepo.findOne({
            where: { idempotencyKey },
            relations: ['providerSessions', 'providerSessions.refund'],
          });
          end();
          if (!entity) return null;
          return this.toDomain(entity);
        } catch (error: any) {
          this._logger.error(
            `Failed to find payment by idempotency key ${idempotencyKey}: ${error.message}`,
            { error, ctx: 'PaymentTypeOrmRepository' },
          );
          throw error;
        }
      },
    );
  }

  async update(payment: Payment): Promise<void> {
    return await this._tracer.startActiveSpan(
      'PaymentTypeOrmRepository.update',
      async (span) => {
        span.setAttribute('payment.id', payment.id);
        try {
          const entity = this.toEntity(payment);
          await this._paymentRepo.save(entity);

          this._logger.debug(`Updated payment with ID ${payment.id}`, {
            ctx: 'PaymentTypeOrmRepository',
          });
        } catch (error: any) {
          this._logger.error(`Failed to update payment: ${error.message}`, {
            error,
            ctx: 'PaymentTypeOrmRepository',
          });
          throw error;
        }
      },
    );
  }

  async findByStatus(status: PaymentStatus): Promise<Payment[]> {
    return await this._tracer.startActiveSpan(
      'PaymentTypeOrmRepository.findByStatus',
      async (span) => {
        span.setAttribute('payment.status', status);
        try {
          const entities = await this._paymentRepo.find({
            where: { status },
            relations: ['providerSessions', 'providerSessions.refund'],
          });
          return entities.map((entity) => this.toDomain(entity));
        } catch (error: any) {
          this._logger.error(
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
      await this._sessionRepo.update({ id: session.id }, entity);
      this._logger.debug(`Updated provider session with ID ${session.id}`, {
        ctx: 'PaymentTypeOrmRepository',
      });
    } catch (error: any) {
      this._logger.error(
        `Failed to update provider session: ${error.message}`,
        {
          error,
          ctx: 'PaymentTypeOrmRepository',
        },
      );
      throw error;
    }
  }

  async invalidateCache(): Promise<void> {
    // No-op
  }

  async deleteById(id: string): Promise<void> {
    return await this._tracer.startActiveSpan(
      'PaymentTypeOrmRepository.deleteById',
      async (span) => {
        span.setAttribute('payment.id', id);
        try {
          await this._paymentRepo.delete({ id });
          this._logger.debug(`Deleted payment with ID ${id}`, {
            ctx: 'PaymentTypeOrmRepository',
          });
        } catch (error: any) {
          this._logger.error(
            `Failed to delete payment by ID ${id}: ${error.message}`,
            { error, ctx: 'PaymentTypeOrmRepository' },
          );
          throw error;
        }
      },
    );
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
