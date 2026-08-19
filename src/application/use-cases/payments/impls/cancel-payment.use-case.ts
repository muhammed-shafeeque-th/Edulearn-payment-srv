import { Injectable } from '@nestjs/common';
import { IdempotencyKey } from '@domain/value-objects/idempotency-key';
import { IPaymentRepository } from '@domain/repositories/payment-repository.interface';
import { IKafkaProducer } from '@application/ports/kafka-producer.interface';
import { PaymentStatus } from '@domain/entities/payments';
import { GatewayFactory } from '@infrastructure/strategies/gateway.factory';
import { CancelPaymentDto } from 'src/presentation/grpc/dtos/cancel-payment.dto';
import { OrderNotFoundException } from '@domain/exceptions/domain.exceptions';
import { RpcException } from '@nestjs/microservices';
import { withRetry } from '@edulearn/core';
import { mapProviderToPaymentProvider } from 'src/shared/utils/mapProviderToDomain';
import { ProviderSessionStatus } from '@domain/entities/payment-provider-sesssion.entity';
import { KafkaTopics } from 'src/shared/event-topics';
import { OrderPaymentFailedEvent } from '@domain/events/order-payment.events';
import { v4 as uuidV4 } from 'uuid';
import { BadRequestException } from 'src/shared/exceptions/infra.exceptions';
import { ILoggerService } from '@application/ports/logger.service';
import { ITraceService } from '@application/ports/trace.service';
import { ICancelPaymentUseCase } from '../interfaces/cancel-payment.interface';
import { IIdempotencyService } from '@application/ports/idempotency.service';

@Injectable()
export class CancelPaymentUseCase implements ICancelPaymentUseCase {
  constructor(
    private readonly _paymentRepository: IPaymentRepository,
    private readonly _kafkaProducer: IKafkaProducer,
    private readonly _idempotencyService: IIdempotencyService,
    private readonly _strategyFactory: GatewayFactory,
    private readonly _logger: ILoggerService,
    private readonly _tracer: ITraceService,
  ) {}

  /**
   * Cancels a payment given a CancelPaymentDto and idempotency key.
   * @param dto CancelPaymentDto containing the details for the payment cancellation.
   * @param idempotencyKeyString The idempotency key as string.
   */
  async execute(dto: CancelPaymentDto, idempotencyKeyString: string) {
    return await this._tracer.startActiveSpan(
      'CancelPaymentUseCase.execute',
      async (span) => {
        try {
          this._logger.debug(`Handling payment cancellation`, {
            ctx: 'CancelPaymentUseCase',
          });

          const provider = mapProviderToPaymentProvider(dto.provider);

          span.setAttributes({
            'provider.order.id': dto.providerOrderId,
            provider: provider,
          });

          const idempotencyKey = new IdempotencyKey(idempotencyKeyString);

          return await this._idempotencyService.check(
            idempotencyKey,
            async () => {
              const payment =
                await this._paymentRepository.findByProviderOrderId(
                  dto.providerOrderId,
                );

              if (!payment) {
                throw new OrderNotFoundException(
                  `Provider Order not found with Id ${dto.providerOrderId}`,
                );
              }

              if (payment.status !== PaymentStatus.PENDING) {
                this._logger.warn(
                  `Payment with transaction Id ${dto.providerOrderId} cannot be cancelled because it is already marked as ${payment.status.toUpperCase()}. Only PENDING payments can be cancelled.`,
                  { ctx: CancelPaymentUseCase.name },
                );
                throw new BadRequestException(
                  'Cannot cancel payment in current status',
                );
              }

              const paymentProvider =
                this._strategyFactory.getGateway(provider);

              const response = await withRetry(
                () =>
                  paymentProvider.cancelPayment(
                    dto.providerOrderId,
                    dto.reason,
                  ),
                { maxAttempts: 3, initialDelay: 1000 },
              );

              if (!response.success) {
                throw new RpcException(
                  `Something went wrong, can't mark payment as failed`,
                );
              }

              const session = payment.getProviderSessionById(
                dto.providerOrderId,
              );
              if (session) {
                session.updateStatus(ProviderSessionStatus.FAILED);
              }

              payment.markCancel(dto.providerOrderId);

              await this._paymentRepository.update(payment);

              await this._kafkaProducer.produce<OrderPaymentFailedEvent>(
                KafkaTopics.PaymentOrderFailed,
                {
                  key: payment.userId,
                  value: {
                    eventId: uuidV4(),
                    eventType: 'OrderPaymentFailedEvent',
                    timestamp: Date.now(),
                    payload: {
                      orderId: payment.orderId,
                      provider,
                      userId: payment.userId,
                      providerOrderId: payment.providerOrderId,
                      paymentStatus: payment.status,
                      paymentId: payment.id,
                    },
                  },
                },
              );

              this._logger.debug(
                `Payment Cancelled: ${payment.id} with status ${payment.status}`,
                { ctx: 'CancelPaymentUseCase' },
              );

              return {
                paymentId: payment.id,
                providerOrderId: payment.providerOrderId!,
                status: payment.status,
              };
            },
          );
        } catch (error: unknown) {
          const errMsg = error instanceof Error ? error.message : String(error);
          this._logger.error(`Failed to process payment: ${errMsg}`, {
            error,
            ctx: 'CancelPaymentUseCase',
          });

          throw error;
        }
      },
    );
  }
}
