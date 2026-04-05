import { Injectable } from '@nestjs/common';
import { IPaymentRepository } from '@domain/repositories/payment-repository.interface';
import { LoggingService } from '@infrastructure/observability/logging/logging.service';
import { TracingService } from '@infrastructure/observability/tracing/trace.service';
import { MetricsService } from '@infrastructure/observability/metrics/metrics.service';
import { StrategyContext } from '@infrastructure/strategies/strategy.context';
import { StrategyFactory } from '@infrastructure/strategies/strategy.factory';
import { PaymentProviderSession } from '@domain/entities/payment-provider-sesssion.entity';
import { v4 as uuidV4 } from 'uuid';
import { OrderClient } from '@infrastructure/grpc/clients/order/order.client';
import { CourseClient } from '@infrastructure/grpc/clients/course/course.client';
import { IExchangeRateService } from '@application/adaptors/exchange-rate.service';
import { Money } from '@domain/value-objects/money';
import { normalizeAndConvertCurrency } from 'src/shared/utils/convert-currency';
import { timeoutPromise } from 'src/shared/utils/_promise-timeout';
import { retry } from 'ts-retry-promise';
import { mapProviderToPaymentProvider } from 'src/shared/utils/mapProviderToDomain';
import { PaymentProvider } from '@domain/entities/payments';
import { KafkaTopics } from 'src/shared/event-topics';
import { OrderPaymentInitiateEvent } from '@domain/events/order-payment.events';
import { IKafkaProducer } from '@application/adaptors/kafka-producer.interface';
import { PaymentNotFoundException } from '@domain/exceptions/domain.exceptions';

export interface CreateProviderSessionDto {
  paymentId: string;
  provider: number;
  successUrl?: string;
  cancelUrl?: string;
}

@Injectable()
export class CreateProviderSessionUseCase {
  constructor(
    private readonly paymentRepository: IPaymentRepository,
    private readonly orderServiceClient: OrderClient,
    private readonly courseServiceClient: CourseClient,
    private readonly strategyContext: StrategyContext,
    private readonly strategyFactory: StrategyFactory,
    private readonly exchangeRateService: IExchangeRateService,
    private readonly kafkaProducer: IKafkaProducer,
    private readonly logger: LoggingService,
    private readonly tracer: TracingService,
    private readonly metrics: MetricsService,
  ) {}

  async execute(dto: CreateProviderSessionDto) {
    return await this.tracer.startActiveSpan(
      'CreateProviderSessionUseCase.execute',
      async (span) => {
        const provider = mapProviderToPaymentProvider(dto.provider);
        span.setAttributes({
          'payment.id': dto.paymentId,
          provider: provider,
        });

        const payment = await this.paymentRepository.findById(dto.paymentId);
        if (!payment) {
          throw new PaymentNotFoundException(
            `Payment with id ${dto.paymentId} not found`,
          );
        }

        if (payment.isTerminalState()) {
          payment.restorePayment();
          this.logger.debug(`Restoring payment from ${payment.status}`);
          // throw new BadRequestException(
          //   `Payment is already in a terminal state: ${payment.status}`,
          // );
        }

        const order = await timeoutPromise(
          () =>
            retry(
              () =>
                this.orderServiceClient.getOrder(
                  payment.orderId,
                  payment.userId,
                ),
              { retries: 2, delay: 1000, backoff: 'EXPONENTIAL' },
            ),
          `Timeout while fetching order details for id ${payment.orderId}`,
        );

        const orderedCourseIds = Array.from(
          new Set(order.items.map((item) => item.courseId).filter(Boolean)),
        );

        const courseDetails = await timeoutPromise(
          () =>
            retry(
              () => this.courseServiceClient.getCourseItems(orderedCourseIds),
              { retries: 2, delay: 1000, backoff: 'EXPONENTIAL' },
            ),
          `Timeout while fetching course details for courseIds: [${orderedCourseIds.join(', ')}]`,
        );

        const providerCurrencyMoney = new Money(order.amount, order.currency);

        const requestedCurrency = providerCurrencyMoney.getCurrency();

        this.strategyContext.setStrategy(
          this.strategyFactory.getStrategy(provider as PaymentProvider),
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
              await this.exchangeRateService.getRate(requestedCurrency, 'USD');
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
              { ctx: 'CreateProviderSessionUseCase' },
            );
            throw new Error('Currency conversion failed');
          }
        }

        const orderItemsDetails = order.items.map((orderItem) => {
          const unitPrice = orderItem.price ?? 0;
          const mappedPrice = normalizeAndConvertCurrency(unitPrice, fxRate);
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

        const paymentResponse = await retry(
          () =>
            this.strategyContext.createPayment({
              userId: payment.userId,
              amount: providerCurrencyMoney,
              orderId: order.id,
              idempotencyKey: payment.idempotencyKey.getValue(),
              items: orderItemsDetails,
              successUrl: dto.successUrl,
              cancelUrl: dto.cancelUrl,
            }),
          { retries: 2, delay: 1000, backoff: 'EXPONENTIAL' },
        );

        const providerOrderId = paymentResponse?.providerOrderId;

        const providerSession = new PaymentProviderSession({
          fxRate,
          fxTimestamp: fxTimestamp ?? new Date(),
          id: uuidV4(),
          paymentId: payment.id,
          provider: provider as PaymentProvider,
          providerAmount: paymentResponse?.providerAmount,
          providerCurrency: paymentResponse?.providerCurrency,
          metadata: paymentResponse?.metadata,
          providerOrderId: providerOrderId,
        });

        payment.addProviderSession(providerSession);
        payment.setProviderOrderId(paymentResponse.providerOrderId);

        await this.paymentRepository.save(payment);

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
                providerOrderId,
                paymentStatus: payment.status,
              },
            },
          },
        );

        this.metrics.incPaymentCounter({
          method: 'create_provider_session',
          status: payment.status,
          gateway: provider as PaymentProvider,
        });

        return {
          paymentId: payment.id,
          provider: provider,
          session: paymentResponse,
        };
      },
    );
  }
}
