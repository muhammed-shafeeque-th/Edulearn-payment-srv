import { Injectable, NotFoundException } from '@nestjs/common';
import { IdempotencyKey } from '@domain/value-objects/idempotency-key';
import { IPaymentRepository } from '@domain/interfaces/payment-repository.interface';
import { IKafkaProducer } from '@domain/interfaces/kafka-producer.interface';
import { retry } from 'ts-retry-promise';
import { LoggingService } from '@infrastructure/observability/logging/logging.service';
import { TracingService } from '@infrastructure/observability/tracing/trace.service';
import { MetricsService } from '@infrastructure/observability/metrics/metrics.service';
import { PaymentGateway } from '@domain/entities/payments';
import { StrategyFactory } from '@infrastructure/strategies/strategy.factory';
import { IdempotencyService } from '@application/services/idempotency.service';
import { PayPalPaymentStrategy } from '@infrastructure/strategies/paypal-payment.strategy';
import { CapturePaymentDto } from 'src/presentation/grpc/dtos/capture-payment.dto';
import { KAFKA_TOPICS } from '@infrastructure/kafka/kafka.topics';

@Injectable()
export class CapturePaypalPaymentUseCase {
  constructor(
    private readonly paymentRepository: IPaymentRepository,
    private readonly kafkaProducer: IKafkaProducer,
    private readonly idempotencyService: IdempotencyService,
    private readonly strategyFactory: StrategyFactory,
    private readonly logger: LoggingService,
    private readonly tracer: TracingService,
    private readonly metrics: MetricsService,
  ) {}

  async execute(dto: CapturePaymentDto, idempotencyKey: string) {
    return await this.tracer.startActiveSpan(
      'CapturePaypalPaymentUseCase.execute',
      async (span) => {
        try {
          span.setAttributes({
            'user.id': dto.userId,
            'idempotency.key': idempotencyKey,
          });

          const idempotency_Key = new IdempotencyKey(idempotencyKey);
          return this.idempotencyService.check(idempotency_Key, async () => {
            // Create payment

            // Set and execute strategy
            const paypalStrategy = this.strategyFactory.getStrategy(
              PaymentGateway.PAYPAL,
            ) as PayPalPaymentStrategy;

            const payment = await this.paymentRepository.findById(
              dto.paymentId,
            );
            if (!payment) {
              throw new NotFoundException(
                'Payment not found with Id ' + dto.paymentId,
              );
            }

            // Process payment with retry logic
            const captureResult = await retry(
              () =>
                paypalStrategy.capturePayment(
                  dto.providerOrderId,

                  idempotency_Key.getValue(),
                ),
              { retries: 3, delay: 1000, backoff: 'EXPONENTIAL' },
            );

            await this.paymentRepository.update(payment);
            this.logger.log(
              `Payment updated: ${payment.getId()} with status ${payment.getStatus()}`,
              { ctx: 'CapturePaypalPaymentUseCase' },
            );

            // Publish event to Kafka
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

            this.metrics.incPaymentCounter({
              method: 'payment_capture',
              status: payment.getStatus(),
              gateway: payment.getPaymentGateway(),
            });

            return {
              status: payment.getStatus(),
              providerOrderId: captureResult.providerOrderId,
              provider: captureResult.provider,
            };
          });
        } catch (error: any) {
          this.logger.error(`Failed to process payment: ${error.message}`, {
            error,
            ctx: 'CapturePaypalPaymentUseCase',
          });
          this.metrics.incPaymentCounter({
            method: 'payment_capture',
            status: 'FAILED',
            gateway: PaymentGateway.PAYPAL,
          });
          throw error;
        }
      },
    );
  }
}
