import { Injectable } from '@nestjs/common';
import { Money } from '@domain/value-objects/money';
import { IdempotencyKey } from '@domain/value-objects/idempotency-key';
import { IPaymentRepository } from '@domain/repositories/payment-repository.interface';
import { retry } from 'ts-retry-promise';
import { Payment } from '@domain/entities/payments';
import { PaymentCreateDto } from 'src/presentation/grpc/dtos/create-payment.dto';
import { timeoutPromise } from 'src/shared/utils/_promise-timeout';
import { BadRequestException } from 'src/shared/exceptions/infra.exceptions';
import { ILoggerService } from '@application/adaptors/logger.service';
import { ITraceService } from '@application/adaptors/trace.service';
import { IMetricService } from '@application/adaptors/metric.service';
import { ICreatePaymentUseCase } from '../interfaces/create-payment.interface';
import { IIdempotencyService } from '@application/adaptors/idempotency.service';
import { IOrderClient } from '@application/adaptors/order-client.interface';
// import { ICacheService } from '@application/adaptors/redis.interface';

@Injectable()
export class CreatePaymentUseCase implements ICreatePaymentUseCase {
  private readonly PAYMENT_TIMEOUT_MS = 3 * 24 * 60 * 60 * 1000; // 3 days;

  constructor(
    private readonly _paymentRepository: IPaymentRepository,
    private readonly _idempotencyService: IIdempotencyService,
    private readonly _orderServiceClient: IOrderClient,
    // private readonly _cache: ICacheService,
    private readonly _logger: ILoggerService,
    private readonly _tracer: ITraceService,
    private readonly _metrics: IMetricService,
  ) {}

  async execute(dto: PaymentCreateDto) {
    return await this._tracer.startActiveSpan(
      'createPaymentUseCase.execute',
      async (span) => {
        span.setAttributes({
          'user.id': dto.userId,
          'order.id': dto.orderId,
          'idempotency.key': dto.idempotencyKey,
        });

        const paymentExist = await this._paymentRepository.findByOrderId(
          dto.orderId,
        );
        if (paymentExist) {
          return {
            orderId: paymentExist.orderId,
            paymentId: paymentExist.id,
            status: paymentExist.status,
          };
        }

        const idempotencyKey = new IdempotencyKey(dto.idempotencyKey);

        try {
          this._logger.debug(
            `Executing CreatePaymentUseCase for user ${dto.userId} [orderId=${dto.orderId}]`,
          );

          return await this._idempotencyService.check(
            idempotencyKey,
            async () => {
              const order = await timeoutPromise(
                () =>
                  retry(
                    () =>
                      this._orderServiceClient.getOrder(
                        dto.orderId,
                        dto.userId,
                      ),
                    { retries: 2, delay: 1000, backoff: 'EXPONENTIAL' },
                  ),
                `Timeout while fetching order details for id ${dto.orderId}`,
              );

              const orderStatus = order.status;

              const allowedStatuses = [
                'created',
                'processing',
                'pending',
                'pending_payment',
              ];

              if (!allowedStatuses.includes(order.status)) {
                this._logger.warn(
                  `Order [id=${dto.orderId}] in invalid status (${orderStatus}), refusing to process payment`,
                  { ctx: 'createPaymentUseCase', orderStatus: orderStatus },
                );
                throw new BadRequestException(
                  `Cannot process payment for order in status ${orderStatus}. Payment allowed only for status 'created' or 'pending_payment'`,
                );
              }

              let payment: Payment | null =
                await this._paymentRepository.findByIdempotencyKey(
                  idempotencyKey.getValue(),
                );

              if (!payment) {
                const originalOrderAmount = new Money(
                  order.amount,
                  order.currency,
                );

                payment = Payment.create(
                  dto.userId,
                  dto.orderId,
                  originalOrderAmount,
                  idempotencyKey,
                  new Date(Date.now() + this.PAYMENT_TIMEOUT_MS),
                );

                this._logger.debug(`Payment created: ${payment.id}`, {
                  ctx: 'createPaymentUseCase',
                });

                await this._paymentRepository.save(payment);

                this._logger.debug(
                  `Payment saved: ${payment.id} with status ${payment.status}`,
                  { ctx: 'createPaymentUseCase' },
                );

                // await this.schedulePaymentTimeout(payment);
              }

              this._metrics.incPaymentCounter({
                method: 'create_payment_domain',
                status: payment.status,
                gateway: 'none',
              });

              return {
                paymentId: payment.id,
                status: payment.status,
                orderId: payment.orderId,
              };
            },
          );
        } catch (error: any) {
          this._logger.error(`Failed to create payment: ${error.message}`, {
            error,
            ctx: 'createPaymentUseCase',
          });
          this._metrics.incPaymentCounter({
            method: 'create_payment_domain',
            status: 'FAILED',
            gateway: 'none',
          });
          throw error;
        }
      },
    );
  }

  // private buildTimeoutKey(paymentId: string) {
  //   return `payments:timeout:${paymentId}`;
  // }

  // private async schedulePaymentTimeout(payment: Payment) {
  //   if (!payment.expiresAt) {
  //     this._logger.warn(
  //       `Payment ${payment.id} does not have expiresAt set. Skipping timeout scheduling.`,
  //     );
  //     return;
  //   }

  //   const ttlMs = payment.expiresAt.getTime() - Date.now();

  //   if (ttlMs <= 0) {
  //     this._logger.warn(
  //       `Payment ${payment.id} already expired or expires immediately. Skipping timeout scheduling.`,
  //     );
  //     return;
  //   }

  //   const ttlSeconds = Math.ceil(ttlMs / 1000);

  //   const key = this.buildTimeoutKey(payment.id);
  //   const payload = JSON.stringify({
  //     paymentId: payment.id,
  //     expiresAt: payment.expiresAt.toISOString(),
  //     orderId: payment.orderId,
  //     userId: payment.userId,
  //   });

  //   await this._cache.set(key, payload, ttlSeconds);
  //   this._logger.debug(
  //     `Scheduled payment timeout in Redis for payment ${payment.id} with TTL ${ttlSeconds}s`,
  //     {
  //       ctx: 'createPaymentUseCase',
  //     },
  //   );
  // }
}
