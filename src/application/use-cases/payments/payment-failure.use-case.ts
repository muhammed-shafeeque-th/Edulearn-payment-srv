import { Injectable, BadRequestException } from '@nestjs/common';
import { IPaymentRepository } from '@domain/repositories/payment-repository.interface';
import { IKafkaProducer } from '@application/adaptors/kafka-producer.interface';
import { LoggingService } from '@infrastructure/observability/logging/logging.service';
import { TracingService } from '@infrastructure/observability/tracing/trace.service';
import { PaymentProvider, PaymentStatus } from '@domain/entities/payments';
import { ProviderSessionStatus } from '@domain/entities/payment-provider-sesssion.entity';
import { KafkaTopics } from 'src/shared/event-topics';
import { v4 as uuidV4 } from 'uuid';
import { OrderNotFoundException } from '@domain/exceptions/domain.exceptions';
import { OrderPaymentFailedEvent } from '@domain/events/order-payment.events';

@Injectable()
export class PaymentFailureUseCase {
  constructor(
    private readonly paymentRepository: IPaymentRepository,
    private readonly kafkaProducer: IKafkaProducer,
    private readonly logger: LoggingService,
    private readonly tracer: TracingService,
  ) {}

  /**
   * Marks a payment as failed by provider details, and broadcasts payment failed event.
   *
   * @param provider The payment provider (enum value).
   * @param providerOrderId The unique provider order/payment ID.
   */
  async execute(
    provider: PaymentProvider,
    providerOrderId: string,
  ): Promise<boolean> {
    return await this.tracer.startActiveSpan(
      'PaymentFailureUseCase.execute',
      async (span) => {
        try {
          this.logger.debug(`Marking payment as failed`, {
            ctx: 'PaymentFailureUseCase',
          });

          span.setAttributes({
            'provider.order.id': providerOrderId,
            provider: provider,
          });

          const payment =
            await this.paymentRepository.findByProviderOrderId(providerOrderId);

          if (!payment) {
            this.logger.error(
              `Payment not found for providerOrderId: ${providerOrderId}`,
              {
                ctx: 'PaymentFailureUseCase',
              },
            );
            throw new OrderNotFoundException(
              `Provider Order not found with Id ${providerOrderId}`,
            );
          }

          if (payment.status === PaymentStatus.FAILED) {
            this.logger.debug(
              `Payment with order ID ${providerOrderId} already marked as FAILED.`,
              { ctx: 'PaymentFailureUseCase' },
            );
            return true;
          }

          if (payment.status !== PaymentStatus.PENDING) {
            this.logger.error(
              `Cannot mark payment ${providerOrderId} as failed because status is ${payment.status}. Only PENDING or RESOLVED payments can be failed.`,
              { ctx: 'PaymentFailureUseCase' },
            );
            throw new BadRequestException(
              'Only PENDING payments can be marked as failed.',
            );
          }

          const session = payment.getProviderSessionById(providerOrderId);
          if (session) {
            session.updateStatus(ProviderSessionStatus.FAILED);
          }

          payment.markFailed();

          await this.paymentRepository.update(payment);

          await this.kafkaProducer.produce<OrderPaymentFailedEvent>(
            KafkaTopics.PaymentOrderFailed,
            {
              key: payment.userId,
              value: {
                eventId: uuidV4(),
                eventType: 'OrderPaymentFailedEvent',
                source: 'payment-service',
                timestamp: Date.now(),
                payload: {
                  paymentId: payment.id,
                  orderId: payment.orderId,
                  provider,
                  userId: payment.userId,
                  providerOrderId: payment.providerOrderId,
                  paymentStatus: payment.status,
                },
              },
            },
          );

          this.logger.debug(
            `Payment marked failed: ${payment.id} status=${payment.status}`,
            { ctx: 'PaymentFailureUseCase' },
          );

          return true;
        } catch (error: unknown) {
          const errMsg = error instanceof Error ? error.message : String(error);
          this.logger.error(`Failed to mark payment as failed: ${errMsg}`, {
            error,
            ctx: 'PaymentFailureUseCase',
          });
          throw error;
        }
      },
    );
  }
}
