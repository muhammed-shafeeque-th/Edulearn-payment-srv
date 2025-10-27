import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { IdempotencyKey } from '@domain/value-objects/idempotency-key';
import { IPaymentRepository } from '@domain/interfaces/payment-repository.interface';
import { IKafkaProducer } from '@domain/interfaces/kafka-producer.interface';
import { retry } from 'ts-retry-promise';
import { LoggingService } from '@infrastructure/observability/logging/logging.service';
import { TracingService } from '@infrastructure/observability/tracing/trace.service';
import { PaymentGateway } from '@domain/entities/payments';
import { StrategyFactory } from '@infrastructure/strategies/strategy.factory';
import { RazorpayPaymentStrategy } from '@infrastructure/strategies/razorpay-strategy';
import { KAFKA_TOPICS } from '@infrastructure/kafka/kafka.topics';
import { IdempotencyService } from '@application/services/idempotency.service';
import { VerifyRazorpayPaymentDto } from 'src/presentation/grpc/dtos/razorpay-verify-payment.dto';

@Injectable()
export class VerifyRazorpayPaymentUseCase {
  constructor(
    private readonly paymentRepository: IPaymentRepository,
    private readonly kafkaProducer: IKafkaProducer,
    private readonly idempotencyService: IdempotencyService,
    private readonly strategyFactory: StrategyFactory,
    private readonly logger: LoggingService,
    private readonly tracer: TracingService,
  ) {}

  async execute(dto: VerifyRazorpayPaymentDto, idempotency_Key: string) {
    return await this.tracer.startActiveSpan(
      'createPaymentUseCase.execute',
      async (span) => {
        try {
          span.setAttributes({
            'order.id': dto.razorpayOrderId,
          });

          const idempotencyKey = new IdempotencyKey(idempotency_Key);
          return this.idempotencyService.check(idempotencyKey, async () => {
            const payment = await this.paymentRepository.findById(
              dto.paymentId,
            );
            if (!payment) {
              throw new NotFoundException(
                'Payment not found with Id ' + dto.paymentId,
              );
            }
            const razorpayStrategy = this.strategyFactory.getStrategy(
              PaymentGateway.RAZORPAY,
            ) as RazorpayPaymentStrategy;

            // Process payment with retry logic
            const ok = await retry(
              async () =>
                await razorpayStrategy.verifySignature(
                  dto.razorpayOrderId,
                  dto.razorpayPaymentId,
                  dto.razorpaySignature,
                ),
              { retries: 3, delay: 1000, backoff: 'EXPONENTIAL' },
            );
            if (!ok) {
              throw new BadRequestException('Invalid verify payload');
            }

            payment.succeed(dto.razorpayPaymentId);

            await this.paymentRepository.update(payment);
            this.logger.log(
              `Payment updated: ${payment.getId()} with status ${payment.getStatus()}`,
              { ctx: 'createPaymentUseCase' },
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

            return {
              paymentId: payment.getId(),
              userId: payment.getUserId(),
              orderId: payment.getOrderId(),
            };
          });
        } catch (error: any) {
          this.logger.error(`Failed to process payment: ${error.message}`, {
            error,
            ctx: 'createPaymentUseCase',
          });

          throw error;
        }
      },
    );
  }
}
