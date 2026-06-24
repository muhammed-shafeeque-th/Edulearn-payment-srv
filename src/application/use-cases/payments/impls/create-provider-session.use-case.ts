import { Injectable } from '@nestjs/common';
import { IPaymentRepository } from '@domain/repositories/payment-repository.interface';
import { StrategyContext } from '@infrastructure/strategies/strategy.context';
import { StrategyFactory } from '@infrastructure/strategies/strategy.factory';
import { PaymentProviderSession } from '@domain/entities/payment-provider-sesssion.entity';
import { v4 as uuidV4 } from 'uuid';
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
import { ILoggerService } from '@application/adaptors/logger.service';
import { ITraceService } from '@application/adaptors/trace.service';
import { IMetricService } from '@application/adaptors/metric.service';
import { IOrderClient } from '@application/adaptors/order-client.interface';
import { ICourseClient } from '@application/adaptors/course-client.interface';

export interface CreateProviderSessionDto {
  paymentId: string;
  provider: number;
  successUrl?: string;
  cancelUrl?: string;
}

@Injectable()
export class CreateProviderSessionUseCase
  implements CreateProviderSessionUseCase
{
  constructor(
    private readonly _paymentRepository: IPaymentRepository,
    private readonly _orderServiceClient: IOrderClient,
    private readonly _courseServiceClient: ICourseClient,
    private readonly _strategyContext: StrategyContext,
    private readonly _strategyFactory: StrategyFactory,
    private readonly _exchangeRateService: IExchangeRateService,
    private readonly _kafkaProducer: IKafkaProducer,
    private readonly _logger: ILoggerService,
    private readonly _tracer: ITraceService,
    private readonly _metrics: IMetricService,
  ) {}

  async execute(dto: CreateProviderSessionDto) {
    return await this._tracer.startActiveSpan(
      'CreateProviderSessionUseCase.execute',
      async (span) => {
        const provider = mapProviderToPaymentProvider(dto.provider);
        span.setAttributes({
          'payment.id': dto.paymentId,
          provider: provider,
        });

        const payment = await this._paymentRepository.findById(dto.paymentId);
        if (!payment) {
          throw new PaymentNotFoundException(
            `Payment with id ${dto.paymentId} not found`,
          );
        }

        if (payment.isTerminalState()) {
          payment.restorePayment();
          this._logger.debug(`Restoring payment from ${payment.status}`);
          // throw new BadRequestException(
          //   `Payment is already in a terminal state: ${payment.status}`,
          // );
        }

        const order = await timeoutPromise(
          () =>
            retry(
              () =>
                this._orderServiceClient.getOrder(
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
              () => this._courseServiceClient.getCourseItems(orderedCourseIds),
              { retries: 2, delay: 1000, backoff: 'EXPONENTIAL' },
            ),
          `Timeout while fetching course details for courseIds: [${orderedCourseIds.join(', ')}]`,
        );

        const providerCurrencyMoney = new Money(order.amount, order.currency);

        const requestedCurrency = providerCurrencyMoney.getCurrency();

        this._strategyContext.setStrategy(
          this._strategyFactory.getStrategy(provider as PaymentProvider),
        );

        const isCurrencySupported =
          this._strategyContext.isCurrencySupported(requestedCurrency);
        let fxRate: number = 1;
        let fxTimestamp: Date | undefined;

        if (!isCurrencySupported) {
          this._logger.debug(
            `Currency ${requestedCurrency} not supported by provider ${provider}, converting to USD...`,
          );
          try {
            const { rate, timestampDate } =
              await this._exchangeRateService.getRate(requestedCurrency, 'USD');
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
            this._logger.error(
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
            this._strategyContext.createPayment({
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

        await this._paymentRepository.save(payment);

        await this._kafkaProducer.produce<OrderPaymentInitiateEvent>(
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

        this._metrics.incPaymentCounter({
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
