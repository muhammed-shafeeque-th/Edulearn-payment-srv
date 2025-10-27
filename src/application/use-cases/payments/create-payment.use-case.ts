import { Injectable } from '@nestjs/common';
import { Money } from '@domain/value-objects/money';
import { IdempotencyKey } from '@domain/value-objects/idempotency-key';
import { IPaymentRepository } from '@domain/interfaces/payment-repository.interface';
import { IKafkaProducer } from '@domain/interfaces/kafka-producer.interface';
import { retry } from 'ts-retry-promise';
import { LoggingService } from '@infrastructure/observability/logging/logging.service';
import { TracingService } from '@infrastructure/observability/tracing/trace.service';
import { MetricsService } from '@infrastructure/observability/metrics/metrics.service';
import { Payment, PaymentGateway } from '@domain/entities/payments';
import { StrategyContext } from '@infrastructure/strategies/strategy.context';
import { StrategyFactory } from '@infrastructure/strategies/strategy.factory';
import { PaymentCreateDto } from 'src/presentation/grpc/dtos/create-payment.dto';
import { IdempotencyService } from '@application/services/idempotency.service';
// import { OrderClient } from '@infrastructure/grpc/clients/order/order.client';
// import { CourseClient } from '@infrastructure/grpc/clients/course/course.client';
import { KAFKA_TOPICS } from '@infrastructure/kafka/kafka.topics';

type PayPalResponse = {
  providerOrderId: string;
  providerOrderStatus: string;
  status: 'PENDING';
  gateway: PaymentGateway.PAYPAL;
  redirectUrl: string;
  metadata: {
    orderId: string;
    amount: number;
  };
};

type RazorpayResponse = {
  providerOrderId: string;
  providerOrderStatus: string;
  status: 'PENDING';
  gateway: PaymentGateway.RAZORPAY;
  keyId: string;
  metadata: {
    providerAmount: string;
    providerCurrency: string;
  };
};

type StripeResponse = {
  providerOrderId: string;
  providerStatus: string;
  status: string;
  gateway: PaymentGateway.STRIPE;
  clientSecret: string;
  metadata: {
    amountReceived: string;
  };
};
type PaymentResponse = StripeResponse | RazorpayResponse | PayPalResponse;

@Injectable()
export class CreatePaymentUseCase {
  constructor(
    private readonly paymentRepository: IPaymentRepository,
    private readonly kafkaProducer: IKafkaProducer,
    private readonly idempotencyService: IdempotencyService,
    // private readonly orderServiceClient: OrderClient,
    // private readonly courseServiceClient: CourseClient,
    private readonly strategyContext: StrategyContext,
    private readonly strategyFactory: StrategyFactory,
    private readonly logger: LoggingService,
    private readonly tracer: TracingService,
    private readonly metrics: MetricsService,
  ) {}

  async execute(dto: PaymentCreateDto) {
    return await this.tracer.startActiveSpan(
      'createPaymentUseCase.execute',
      async (span) => {
        try {
          this.logger.info(
            'Executing CreatePaymentUseCase for user ' + dto.userId,
          );
          span.setAttributes({
            'user.id': dto.userId,
            'order.id': dto.orderId,
            'idempotency.key': dto.idempotencyKey,
          });
          const idempotencyKey = new IdempotencyKey(dto.idempotencyKey);
          return await this.idempotencyService.check(
            idempotencyKey,
            async () => {
              // const order = await this.orderServiceClient.getOrder(
              //   dto.orderId,
              //   dto.userId,
              // );
              // this.logger.info(
              //   `Successfully fetched order ` + JSON.stringify(order, null, 2),
              // );

              // const orderedCourseIds = Array.from(
              //   new Set(order.items.map((item) => item.courseId)),
              // );

              // const courseDetails =
              //   await this.courseServiceClient.getCourseItems(orderedCourseIds);

              // const orderItemsDetails = order.items.map((orderItem) => ({
              //   // courseId: orderItem.courseId,
              //   quantity: '1',
              //   unitAmount: {
              //     currencyCode: orderItem.currency,
              //     value: orderItem.price.toString(),
              //   },
              //   name: courseDetails!.get(orderItem.courseId)!.title,
              //   imageUrl: courseDetails?.get(orderItem.courseId)?.thumbnail,
              // }));

              // this.logger.info(
              //   `Successfully fetched order items ` +
              //     JSON.stringify(orderItemsDetails, null, 2),
              // );

              let payment: Payment | null;
              payment = await this.paymentRepository.findByIdempotencyKey(
                idempotencyKey.getValue(),
              );

              if (!payment) {
                // Create payment
                const amount = new Money(
                  dto.amount.amount,
                  dto.amount.currency,
                );
                payment = Payment.create(
                  dto.userId,
                  dto.orderId,
                  amount,
                  idempotencyKey,
                  dto.paymentGateway,
                );

                this.logger.log(`Payment created: ${payment.getId()}`, {
                  ctx: 'createPaymentUseCase',
                });
              }

              // Set and execute strategy
              this.strategyContext.setStrategy(
                this.strategyFactory.getStrategy(dto.paymentGateway),
              );

              // Process payment with retry logic
              const strategyResponse = await retry(
                () =>
                  this.strategyContext.executePayment<PaymentResponse>({
                    userId: dto.userId,
                    amount: payment.getAmount(),
                    idempotencyKey: idempotencyKey.getValue(),
                    // items: orderItemsDetails,
                    successUrl: dto.successUrl,
                    cancelUrl: dto.cancelUrl,
                  }),
                { retries: 2, delay: 1000, backoff: 'EXPONENTIAL' },
              );

              payment.setProviderOrderId(strategyResponse.providerOrderId);
              await this.paymentRepository.save(payment);

              // await this.paymentRepository.update(payment);
              this.logger.log(
                `Payment saved: ${payment.getId()} with status ${payment.getStatus()}`,
                { ctx: 'createPaymentUseCase' },
              );

              // Publish event to Kafka
              await this.kafkaProducer.send(
                KAFKA_TOPICS.PAYMENT_PAYMENT_CREATE,
                {
                  paymentId: payment.getId(),
                  orderId: payment.getOrderId(),
                  provider: payment.getPaymentGateway(),
                  providerOrderId: payment.getProviderOrderId(),
                  status: payment.getStatus(),
                  transactionId: payment.getProviderOrderId(),
                  createdAt: payment.getCreatedAt(),
                },
              );

              this.metrics.incPaymentCounter({
                method: 'process_payment',
                status: payment.getStatus(),
                gateway: dto.paymentGateway,
              });

              const result = this.mapToResponse(payment, strategyResponse);

              return result;
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
            gateway: dto.paymentGateway,
          });
          throw error;
        }
      },
    );
  }

  private mapToResponse(payment: Payment, response: PaymentResponse) {
    const paymentResponse = {
      paymentId: payment.getId(),
      userId: payment.getUserId(),
      orderId: payment.getOrderId(),
      amount: payment.getAmount().toJSON(),
      status: payment.getStatus(),
    };
    return {
      ...(response.gateway === PaymentGateway.PAYPAL
        ? {
            ...paymentResponse,
            gateway: response.gateway,
            paypal: {
              metadata: response.metadata,
              redirectUrl: response.redirectUrl,
              providerOrderId: response.providerOrderId,
            },
          }
        : response.gateway === PaymentGateway.STRIPE
          ? {
              ...paymentResponse,
              gateway: response.gateway,
              stripe: {
                providerOrderId: response.providerOrderId,
                clientSecret: response.clientSecret,
                metadata: response.metadata,
              },
            }
          : {
              ...paymentResponse,
              gateway: response.gateway,
              razorpay: {
                keyId: response.keyId,
                providerOrderId: response.providerOrderId,
                metadata: response.metadata,
              },
            }),
    };
  }
}
