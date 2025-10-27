import { Injectable } from '@nestjs/common';
import { IdempotencyKey } from '@domain/value-objects/idempotency-key';
import { IPaymentRepository } from '@domain/interfaces/payment-repository.interface';
import { IKafkaProducer } from '@domain/interfaces/kafka-producer.interface';
import { retry } from 'ts-retry-promise';
import { LoggingService } from '@infrastructure/observability/logging/logging.service';
import { TracingService } from '@infrastructure/observability/tracing/trace.service';
import { PaymentGateway } from '@domain/entities/payments';
import { StrategyFactory } from '@infrastructure/strategies/strategy.factory';
import { VerifyStripePaymentDto } from 'src/presentation/grpc/dtos/stripe-verify-payment.dto';
import { KAFKA_TOPICS } from '@infrastructure/kafka/kafka.topics';
import { IdempotencyService } from '@application/services/idempotency.service';
import { StripePaymentStrategy } from '@infrastructure/strategies/stripe-payment.strategy';
import { OrderNotFoundException } from '@domain/exceptions/domain.exceptions';

@Injectable()
export class VerifyStripePaymentUseCase {
  constructor(
    private readonly paymentRepository: IPaymentRepository,
    private readonly kafkaProducer: IKafkaProducer,
    private readonly idempotencyService: IdempotencyService,
    private readonly strategyFactory: StrategyFactory,
    private readonly logger: LoggingService,
    private readonly tracer: TracingService,
  ) {}

  async execute(dto: VerifyStripePaymentDto, idempotency_Key: string) {
    return await this.tracer.startActiveSpan(
      'VerifyStripePaymentUseCase.execute',
      async (span) => {
        try {
          span.setAttributes({
            'provider.order.id': dto.providerOrderId,
          });

          const idempotencyKey = new IdempotencyKey(idempotency_Key);
          return this.idempotencyService.check(idempotencyKey, async () => {
            const payment = await this.paymentRepository.findByProviderOrderId(
              dto.providerOrderId,
            );
            if (!payment) {
              throw new OrderNotFoundException(
                'Provider Order not found with Id ' + dto.providerOrderId,
              );
            }
            const stripeStrategy = this.strategyFactory.getStrategy(
              PaymentGateway.STRIPE,
            ) as StripePaymentStrategy;

            // Process payment with retry logic
            const providerResponse = await retry(
              async () =>
                await stripeStrategy.verifyPayment(dto.providerOrderId),
              { retries: 3, delay: 1000, backoff: 'EXPONENTIAL' },
            );
            if (providerResponse.paymentStatus === 'paid') {
              payment.succeed(providerResponse.providerOrderId);

              await this.kafkaProducer.send(
                KAFKA_TOPICS.PAYMENT_PAYMENT_SUCCESS,
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
            } else if (
              (providerResponse.paymentStatus === 'unpaid' ||
                providerResponse.paymentStatus === 'no_payment_required') &&
              providerResponse.providerOrderStatus === 'expired'
            ) {
              payment.fail();

              await this.kafkaProducer.send(
                KAFKA_TOPICS.PAYMENT_PAYMENT_FAILURE,
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
            }

            await this.paymentRepository.update(payment);
            this.logger.log(
              `Payment updated: ${payment.getId()} with status ${payment.getStatus()}`,
              { ctx: 'VerifyStripePaymentUseCase' },
            );

            // Publish event to Kafka

            return {
              paymentId: payment.getId(),
              userId: payment.getUserId(),
              orderId: payment.getOrderId(),
            };
          });
        } catch (error: any) {
          this.logger.error(`Failed to process payment: ${error.message}`, {
            error,
            ctx: 'VerifyStripePaymentUseCase',
          });

          throw error;
        }
      },
    );
  }
}
