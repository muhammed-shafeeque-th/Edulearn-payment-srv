import { Injectable, BadRequestException } from '@nestjs/common';
import { Money } from '@domain/value-objects/money';
import { IdempotencyKey } from '@domain/value-objects/idempotency-key';
import { IPaymentRepository } from '@domain/repositories/payment-repository.interface';
import { IKafkaProducer } from '@application/adaptors/kafka-producer.interface';
import { retry } from 'ts-retry-promise';
import { LoggingService } from '@infrastructure/observability/logging/logging.service';
import { TracingService } from '@infrastructure/observability/tracing/trace.service';
import { MetricsService } from '@infrastructure/observability/metrics/metrics.service';
import { Payment } from '@domain/entities/payments';
import { StrategyContext } from '@infrastructure/strategies/strategy.context';
import { StrategyFactory } from '@infrastructure/strategies/strategy.factory';
import { PaymentCreateDto } from 'src/presentation/grpc/dtos/create-payment.dto';
import { IdempotencyService } from '@infrastructure/services/idempotency.service';
import { OrderClient } from '@infrastructure/grpc/clients/order/order.client';
import { CourseClient } from '@infrastructure/grpc/clients/course/course.client';
import { timeoutPromise } from 'src/shared/utils/_promise-timeout';
import { mapProviderToPaymentProvider } from 'src/shared/utils/mapProviderToDomain';
import { PaymentSessionResult } from '@application/adaptors/payment-strategy.interface';
import { IExchangeRateService } from '@application/adaptors/exchange-rate.service';
import { PaymentProviderSession } from '@domain/entities/payment-provider-sesssion.entity';
import { v4 as uuidV4 } from 'uuid';
import { normalizeAndConvertCurrency } from 'src/shared/utils/convert-currency';
import { KafkaTopics } from 'src/shared/event-topics';
import { OrderPaymentInitiateEvent } from '@domain/events/order-payment.events';
import { ICacheService } from '@application/adaptors/redis.interface';

@Injectable()
export class CreatePaymentUseCase {
  private readonly PAYMENT_TIMEOUT_MS = 10 * 60 * 1000;

  constructor(
    private readonly paymentRepository: IPaymentRepository,
    private readonly kafkaProducer: IKafkaProducer,
    private readonly idempotencyService: IdempotencyService,
    private readonly exchangeRateService: IExchangeRateService,
    private readonly orderServiceClient: OrderClient,
    private readonly courseServiceClient: CourseClient,
    private readonly strategyContext: StrategyContext,
    private readonly strategyFactory: StrategyFactory,
    private readonly cacheService: ICacheService,
    private readonly logger: LoggingService,
    private readonly tracer: TracingService,
    private readonly metrics: MetricsService,
  ) {}

  async execute(dto: PaymentCreateDto) {
    return await this.tracer.startActiveSpan(
      'createPaymentUseCase.execute',
      async (span) => {
        const provider = mapProviderToPaymentProvider(dto.provider);

        span.setAttributes({
          'user.id': dto.userId,
          'order.id': dto.orderId,
          'idempotency.key': dto.idempotencyKey,
        });

        const idempotencyKey = new IdempotencyKey(dto.idempotencyKey);

        try {
          this.logger.debug(
            `Executing CreatePaymentUseCase for user ${dto.userId} [orderId=${dto.orderId}, provider=${provider}]`,
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

              const orderedCourseIds = Array.from(
                new Set(
                  order.items.map((item) => item.courseId).filter(Boolean),
                ),
              );

              const courseDetails = await timeoutPromise(
                () =>
                  retry(
                    () =>
                      this.courseServiceClient.getCourseItems(orderedCourseIds),
                    { retries: 2, delay: 1000, backoff: 'EXPONENTIAL' },
                  ),
                `Timeout while fetching course details for courseIds: [${orderedCourseIds.join(', ')}]`,
              );

              let payment: Payment | null =
                await this.paymentRepository.findByIdempotencyKey(
                  idempotencyKey.getValue(),
                );

              const originalOrderAmount = new Money(
                order.amount,
                order.currency,
              );

              const providerCurrencyMoney = new Money(
                order.amount,
                order.currency,
              );

              const requestedCurrency = providerCurrencyMoney.getCurrency();

              this.strategyContext.setStrategy(
                this.strategyFactory.getStrategy(provider),
              );

              const isCurrencySupported =
                this.strategyContext.isCurrencySupported(requestedCurrency);
              let fxRate: number = 1;
              let fxTimestamp: Date | undefined;
              if (!isCurrencySupported) {
                this.logger.debug(
                  `Currency ${requestedCurrency} not supported by provider ${provider}, converting to USD...`,
                );
                try {
                  const { rate, timestampDate } =
                    await this.exchangeRateService.getRate(
                      requestedCurrency,
                      'USD',
                    );
                  fxRate = rate;
                  fxTimestamp = timestampDate;
                  if (typeof fxRate !== 'number' || isNaN(fxRate)) {
                    throw new Error('USD rate not found');
                  }
                  const origAmount = providerCurrencyMoney.getAmount();
                  const convertedAmount = normalizeAndConvertCurrency(
                    origAmount,
                    fxRate,
                  );

                  providerCurrencyMoney.setAmount(convertedAmount);
                  providerCurrencyMoney.setCurrency('USD');
                } catch (err: any) {
                  this.logger.error(
                    `Could not convert ${requestedCurrency} to USD: ${err?.message}`,
                    { ctx: 'createPaymentUseCase' },
                  );
                  throw new Error('Currency conversion failed');
                }
              }

              const orderItemsDetails = order.items.map((orderItem) => {
                const unitPrice = orderItem.price ?? 0;
                const mappedPrice = normalizeAndConvertCurrency(
                  unitPrice,
                  fxRate,
                );
                return {
                  courseId: orderItem.courseId,
                  quantity: '1',
                  unitAmount: {
                    currencyCode: providerCurrencyMoney.getCurrency(),
                    value: String(mappedPrice),
                  },
                  name: courseDetails?.get(orderItem.courseId)?.title ?? '',
                  imageUrl: courseDetails?.get(orderItem.courseId)?.thumbnail,
                };
              });

              const totalOrderItemsAmount = orderItemsDetails.reduce(
                (sum, item) => {
                  const value =
                    Number(item.unitAmount.value) *
                    (Number(item.quantity) || 1);
                  return sum + value;
                },
                0,
              );

              const allowableDiff = 1;
              if (
                Math.abs(
                  Number(providerCurrencyMoney.getAmount()) -
                    totalOrderItemsAmount,
                ) > allowableDiff
              ) {
                this.logger.error(
                  `Order items total (${totalOrderItemsAmount}) does not match provider payment amount (${providerCurrencyMoney.getAmount()}) after conversion`,
                  { ctx: 'createPaymentUseCase' },
                );
                throw new BadRequestException(
                  `Sum of order items (${totalOrderItemsAmount}) does not match order amount (${providerCurrencyMoney.getAmount()})`,
                );
              }

              const paymentResponse = await retry(
                () =>
                  this.strategyContext.createPayment({
                    userId: dto.userId,
                    amount: providerCurrencyMoney,
                    orderId: order.id,
                    idempotencyKey: idempotencyKey.getValue(),
                    items: orderItemsDetails,
                    successUrl: dto.successUrl,
                    cancelUrl: dto.cancelUrl,
                  }),
                { retries: 2, delay: 1000, backoff: 'EXPONENTIAL' },
              );

              if (!payment) {
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
              }

              let providerSessionAmount = undefined;
              if (
                paymentResponse?.providerAmount !== undefined &&
                paymentResponse?.providerCurrency !== undefined
              ) {
                providerSessionAmount = Number(paymentResponse.providerAmount);

                if (
                  Math.abs(providerSessionAmount - totalOrderItemsAmount) >
                    allowableDiff ||
                  Math.abs(
                    providerSessionAmount -
                      Number(providerCurrencyMoney.getAmount()),
                  ) > allowableDiff
                ) {
                  this.logger.error(
                    `Provider session amount (${providerSessionAmount}) does not match sum of order items (${totalOrderItemsAmount}) or order amount (${providerCurrencyMoney.getAmount()})`,
                    { ctx: 'createPaymentUseCase' },
                  );
                  throw new BadRequestException(
                    `Provider payment amount mismatch: items (${totalOrderItemsAmount}) / order (${providerCurrencyMoney.getAmount()}) vs provider (${providerSessionAmount})`,
                  );
                }
              }

              const providerSession = new PaymentProviderSession({
                fxRate,
                fxTimestamp: fxTimestamp ?? new Date(),
                id: uuidV4(),
                paymentId: payment.id,
                provider,
                providerAmount: paymentResponse?.providerAmount,
                providerCurrency: paymentResponse?.providerCurrency,
                metadata: paymentResponse?.metadata,
                providerOrderId: paymentResponse?.providerOrderId,
              });

              payment.addProviderSession(providerSession);

              this.logger.debug(
                `Provider ${provider} session created: ${providerSession.id}`,
                { ctx: 'createProviderSessionUseCase' },
              );

              payment.setProviderOrderId(paymentResponse.providerOrderId);

              await this.paymentRepository.save(payment);

              this.logger.debug(
                `Payment saved: ${payment.id} with status ${payment.status}`,
                { ctx: 'createPaymentUseCase' },
              );

              await this.schedulePaymentTimeout(payment);

              await this.kafkaProducer.produce<OrderPaymentInitiateEvent>(
                KafkaTopics.PaymentOrderInitiated,
                {
                  key: payment.userId,
                  value: {
                    eventId: uuidV4(),
                    eventType: 'OrderPaymentInitiateEvent',
                    source: 'payment-service',
                    timestamp: Date.now(),
                    payload: {
                      paymentId: payment.id,
                      userId: payment.userId,
                      orderId: payment.orderId,
                      provider,
                      providerOrderId: payment.providerOrderId,
                      paymentStatus: payment.status,
                    },
                  },
                },
              );

              this.metrics.incPaymentCounter({
                method: 'process_payment',
                status: payment.status,
                gateway: provider,
              });

              return this.mapToResponse(payment, paymentResponse);
            },
          );
        } catch (error: any) {
          this.logger.error(`Failed to process payment: ${error.message}`, {
            error,
            ctx: 'createPaymentUseCase',
          });
          this.metrics.incPaymentCounter({
            method: 'process_payment',
            status: 'FAILED',
            gateway: provider,
          });
          throw error;
        }
      },
    );
  }

  private buildTimeoutKey(paymentId: string) {
    return `payments:timeout:${paymentId}`;
  }

  private async schedulePaymentTimeout(payment: Payment) {
    if (!payment.expiresAt) {
      this.logger.warn(
        `Payment ${payment.id} does not have expiresAt set. Skipping timeout scheduling.`,
      );
      return;
    }

    const ttlMs = payment.expiresAt.getTime() - Date.now();

    if (ttlMs <= 0) {
      this.logger.warn(
        `Payment ${payment.id} already expired or expires immediately. Skipping timeout scheduling.`,
      );
      return;
    }

    const ttlSeconds = Math.ceil(ttlMs / 1000);

    const key = this.buildTimeoutKey(payment.id);
    const payload = JSON.stringify({
      paymentId: payment.id,
      expiresAt: payment.expiresAt.toISOString(),
      orderId: payment.orderId,
      userId: payment.userId,
    });

    await this.cacheService.set(key, payload, ttlSeconds);
    this.logger.debug(
      `Scheduled payment timeout in Redis for payment ${payment.id} with TTL ${ttlSeconds}s`,
      {
        ctx: 'createPaymentUseCase',
      },
    );
  }

  private mapToResponse(payment: Payment, response: PaymentSessionResult) {
    const paymentResponse = {
      paymentId: payment.id,
      provider: response?.provider,
      orderId: payment.orderId,
      amount: payment.amount?.toJSON(),
      status: payment.status,
    };
    return {
      ...paymentResponse,
      session: response,
    };
  }
}
