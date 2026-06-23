import { Injectable } from '@nestjs/common';
import { Money } from '@domain/value-objects/money';
import { IdempotencyKey } from '@domain/value-objects/idempotency-key';
import { IPaymentRepository } from '@domain/repositories/payment-repository.interface';
import { retry } from 'ts-retry-promise';
import { LoggingService } from '@infrastructure/observability/logging/logging.service';
import { TracingService } from '@infrastructure/observability/tracing/trace.service';
import { MetricsService } from '@infrastructure/observability/metrics/metrics.service';
import { Payment } from '@domain/entities/payments';
import { PaymentCreateDto } from 'src/presentation/grpc/dtos/create-payment.dto';
import { IdempotencyService } from '@infrastructure/services/idempotency.service';
import { OrderClient } from '@infrastructure/grpc/clients/order/order.client';
import { timeoutPromise } from 'src/shared/utils/_promise-timeout';
import { BadRequestException } from 'src/shared/exceptions/infra.exceptions';
// import { ICacheService } from '@application/adaptors/redis.interface';

@Injectable()
export class CreatePaymentUseCase {
  private readonly PAYMENT_TIMEOUT_MS = 3 * 24 * 60 * 60 * 1000; // 3 days;

  constructor(
    private readonly paymentRepository: IPaymentRepository,
    private readonly idempotencyService: IdempotencyService,
    private readonly orderServiceClient: OrderClient,
    // private readonly cacheService: ICacheService,
    private readonly logger: LoggingService,
    private readonly tracer: TracingService,
    private readonly metrics: MetricsService,
  ) {}

  async execute(dto: PaymentCreateDto) {
    return await this.tracer.startActiveSpan(
      'createPaymentUseCase.execute',
      async (span) => {
        span.setAttributes({
          'user.id': dto.userId,
          'order.id': dto.orderId,
          'idempotency.key': dto.idempotencyKey,
        });

        const paymentExist = await this.paymentRepository.findByOrderId(
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
          this.logger.debug(
            `Executing CreatePaymentUseCase for user ${dto.userId} [orderId=${dto.orderId}]`,
          );

          return await this.idempotencyService.check(
            idempotencyKey,
            async () => {
              const order = await timeoutPromise(
                () =>
                  retry(
                    () =>
                      this.orderServiceClient.getOrder(dto.orderId, dto.userId),
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
                this.logger.warn(
                  `Order [id=${dto.orderId}] in invalid status (${orderStatus}), refusing to process payment`,
                  { ctx: 'createPaymentUseCase', orderStatus: orderStatus },
                );
                throw new BadRequestException(
                  `Cannot process payment for order in status ${orderStatus}. Payment allowed only for status 'created' or 'pending_payment'`,
                );
              }

              let payment: Payment | null =
                await this.paymentRepository.findByIdempotencyKey(
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

                this.logger.debug(`Payment created: ${payment.id}`, {
                  ctx: 'createPaymentUseCase',
                });

                await this.paymentRepository.save(payment);

                this.logger.debug(
                  `Payment saved: ${payment.id} with status ${payment.status}`,
                  { ctx: 'createPaymentUseCase' },
                );

                // await this.schedulePaymentTimeout(payment);
              }

              this.metrics.incPaymentCounter({
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
          this.logger.error(`Failed to create payment: ${error.message}`, {
            error,
            ctx: 'createPaymentUseCase',
          });
          this.metrics.incPaymentCounter({
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
  //     this.logger.warn(
  //       `Payment ${payment.id} does not have expiresAt set. Skipping timeout scheduling.`,
  //     );
  //     return;
  //   }

  //   const ttlMs = payment.expiresAt.getTime() - Date.now();

  //   if (ttlMs <= 0) {
  //     this.logger.warn(
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

  //   await this.cacheService.set(key, payload, ttlSeconds);
  //   this.logger.debug(
  //     `Scheduled payment timeout in Redis for payment ${payment.id} with TTL ${ttlSeconds}s`,
  //     {
  //       ctx: 'createPaymentUseCase',
  //     },
  //   );
  // }
}
