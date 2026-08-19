import { Injectable } from '@nestjs/common';
import { IPaymentRepository } from '@domain/repositories/payment-repository.interface';
import { IKafkaProducer } from '@application/ports/kafka-producer.interface';
import { PaymentProvider, PaymentStatus } from '@domain/entities/payments';
import { ProviderSessionStatus } from '@domain/entities/payment-provider-sesssion.entity';
import { KafkaTopics } from 'src/shared/event-topics';
import { v4 as uuidV4 } from 'uuid';
import { OrderNotFoundException } from '@domain/exceptions/domain.exceptions';
import { OrderPaymentSuccessEvent } from '@domain/events/order-payment.events';
import { BadRequestException } from 'src/shared/exceptions/infra.exceptions';
import { ILoggerService } from '@application/ports/logger.service';
import { ITraceService } from '@application/ports/trace.service';
import { ISuccessPaymentUseCase } from '../interfaces/success-payment.interface';

@Injectable()
export class SuccessPaymentUseCase implements ISuccessPaymentUseCase {
  constructor(
    private readonly _paymentRepository: IPaymentRepository,
    private readonly _kafkaProducer: IKafkaProducer,
    private readonly _logger: ILoggerService,
    private readonly _tracer: ITraceService,
  ) {}

  /**
   * Mark payment as success with provider order id and provider.
   *
   *  @param provider The payment provider.
   * @param providerOrderId The unique provider order/payment ID.
   */
  async execute(provider: PaymentProvider, providerOrderId: string) {
    return await this._tracer.startActiveSpan(
      'SuccessPaymentUseCase.execute',
      async (span) => {
        try {
          this._logger.debug(`Handling payment success use-case`, {
            ctx: 'SuccessPaymentUseCase',
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
            throw new OrderNotFoundException(
              `Provider Order not found with Id ${providerOrderId}`,
            );
          }

          if (
            payment.status !== PaymentStatus.RESOLVED &&
            payment.status !== PaymentStatus.PENDING
          ) {
            this._logger.warn(
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

          await this._paymentRepository.update(payment);

          await this._kafkaProducer.produce<OrderPaymentSuccessEvent>(
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

          this._logger.debug(
            `Payment Succeed: ${payment.id} with status ${payment.status}`,
            { ctx: 'SuccessPaymentUseCase' },
          );

          return true;
        } catch (error: unknown) {
          const errMsg = error instanceof Error ? error.message : String(error);
          this._logger.error(`Failed to process payment: ${errMsg}`, {
            error,
            ctx: 'SuccessPaymentUseCase',
          });

          throw error;
        }
      },
    );
  }
}
