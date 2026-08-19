import { Injectable } from '@nestjs/common';
import { IPaymentRepository } from '@domain/repositories/payment-repository.interface';
import { IKafkaProducer } from '@application/ports/kafka-producer.interface';
import { PaymentProvider, PaymentStatus } from '@domain/entities/payments';
import { ProviderSessionStatus } from '@domain/entities/payment-provider-sesssion.entity';
import { KafkaTopics } from 'src/shared/event-topics';
import { v4 as uuidV4 } from 'uuid';
import { OrderNotFoundException } from '@domain/exceptions/domain.exceptions';
import { OrderPaymentFailedEvent } from '@domain/events/order-payment.events';
import { BadRequestException } from 'src/shared/exceptions/infra.exceptions';
import { ILoggerService } from '@application/ports/logger.service';
import { ITraceService } from '@application/ports/trace.service';
import { IPaymentFailureUseCase } from '../interfaces/payment-failure.interface';

@Injectable()
export class PaymentFailureUseCase implements IPaymentFailureUseCase {
  constructor(
    private readonly _paymentRepository: IPaymentRepository,
    private readonly _kafkaProducer: IKafkaProducer,
    private readonly _logger: ILoggerService,
    private readonly _tracer: ITraceService,
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
    return await this._tracer.startActiveSpan(
      'PaymentFailureUseCase.execute',
      async (span) => {
        try {
          this._logger.debug(`Marking payment as failed`, {
            ctx: 'PaymentFailureUseCase',
          });

          span.setAttributes({
            'provider.order.id': providerOrderId,
            provider: provider,
          });

          const payment =
            await this._paymentRepository.findByProviderOrderId(
              providerOrderId,
            );

          if (!payment) {
            this._logger.error(
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
            this._logger.debug(
              `Payment with order ID ${providerOrderId} already marked as FAILED.`,
              { ctx: 'PaymentFailureUseCase' },
            );
            return true;
          }

          if (payment.status !== PaymentStatus.PENDING) {
            this._logger.error(
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

          await this._paymentRepository.update(payment);

          await this._kafkaProducer.produce<OrderPaymentFailedEvent>(
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

          this._logger.debug(
            `Payment marked failed: ${payment.id} status=${payment.status}`,
            { ctx: 'PaymentFailureUseCase' },
          );

          return true;
        } catch (error: unknown) {
          const errMsg = error instanceof Error ? error.message : String(error);
          this._logger.error(`Failed to mark payment as failed: ${errMsg}`, {
            error,
            ctx: 'PaymentFailureUseCase',
          });
          throw error;
        }
      },
    );
  }
}
