import { BadRequestException, Injectable } from '@nestjs/common';
import { IPaymentRepository } from '@domain/repositories/payment-repository.interface';
import { IKafkaProducer } from '@application/adaptors/kafka-producer.interface';
import { LoggingService } from '@infrastructure/observability/logging/logging.service';
import { TracingService } from '@infrastructure/observability/tracing/trace.service';
import { PaymentProvider, PaymentStatus } from '@domain/entities/payments';
import { ProviderSessionStatus } from '@domain/entities/payment-provider-sesssion.entity';
import { KafkaTopics } from 'src/shared/event-topics';
import { v4 as uuidV4 } from 'uuid';
import { OrderNotFoundException } from '@domain/exceptions/domain.exceptions';
import { OrderPaymentSuccessEvent } from '@domain/events/order-payment.events';

@Injectable()
export class SuccessPaymentUseCase {
  constructor(
    private readonly paymentRepository: IPaymentRepository,
    private readonly kafkaProducer: IKafkaProducer,
    private readonly logger: LoggingService,
    private readonly tracer: TracingService,
  ) {}

  /**
   * Mark payment as success with provider order id and provider.
   *
   *  @param provider The payment provider.
   * @param providerOrderId The unique provider order/payment ID.
   */
  async execute(provider: PaymentProvider, providerOrderId: string) {
    return await this.tracer.startActiveSpan(
      'SuccessPaymentUseCase.execute',
      async (span) => {
        try {
          this.logger.debug(`Handling payment success use-case`, {
            ctx: 'SuccessPaymentUseCase',
          });

          span.setAttributes({
            'provider.order.id': providerOrderId,
            provider: provider,
          });

          const payment =
            await this.paymentRepository.findByProviderOrderId(providerOrderId);

          if (!payment) {
            throw new OrderNotFoundException(
              `Provider Order not found with Id ${providerOrderId}`,
            );
          }

          if (
            payment.status !== PaymentStatus.RESOLVED &&
            payment.status !== PaymentStatus.PENDING
          ) {
            this.logger.warn(
              `Payment with transaction Id ${providerOrderId} cannot be marked as success because it is already marked as ${payment.status.toUpperCase()}. Only PENDING/RESOLVED payments can be marked as success.`,
              { ctx: SuccessPaymentUseCase.name },
            );
            throw new BadRequestException(
              'Cannot mark success payment in current status',
            );
          }

          const session = payment.getProviderSessionById(providerOrderId);
          if (session) {
            session.updateStatus(ProviderSessionStatus.FAILED);
          }

          payment.markSucceed();

          await this.paymentRepository.update(payment);

          await this.kafkaProducer.produce<OrderPaymentSuccessEvent>(
            KafkaTopics.PaymentOrderSucceeded,
            {
              key: payment.userId,
              value: {
                eventId: uuidV4(),
                eventType: 'OrderPaymentSuccessEvent',
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
            `Payment Succeed: ${payment.id} with status ${payment.status}`,
            { ctx: 'SuccessPaymentUseCase' },
          );

          return true;
        } catch (error: unknown) {
          const errMsg = error instanceof Error ? error.message : String(error);
          this.logger.error(`Failed to process payment: ${errMsg}`, {
            error,
            ctx: 'SuccessPaymentUseCase',
          });

          throw error;
        }
      },
    );
  }
}
