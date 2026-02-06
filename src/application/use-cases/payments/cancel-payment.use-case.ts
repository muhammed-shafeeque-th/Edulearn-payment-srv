import { BadRequestException, Injectable } from '@nestjs/common';
import { IdempotencyKey } from '@domain/value-objects/idempotency-key';
import { IPaymentRepository } from '@domain/repositories/payment-repository.interface';
import { IKafkaProducer } from '@application/adaptors/kafka-producer.interface';
import { retry } from 'ts-retry-promise';
import { LoggingService } from '@infrastructure/observability/logging/logging.service';
import { TracingService } from '@infrastructure/observability/tracing/trace.service';
import { PaymentStatus } from '@domain/entities/payments';
import { StrategyFactory } from '@infrastructure/strategies/strategy.factory';
import { CancelPaymentDto } from 'src/presentation/grpc/dtos/cancel-payment.dto';
import { IdempotencyService } from '@infrastructure/services/idempotency.service';
import { OrderNotFoundException } from '@domain/exceptions/domain.exceptions';
import { RpcException } from '@nestjs/microservices';
import { mapProviderToPaymentProvider } from 'src/shared/utils/mapProviderToDomain';
import { ProviderSessionStatus } from '@domain/entities/payment-provider-sesssion.entity';
import { KafkaTopics } from 'src/shared/event-topics';
import { OrderPaymentFailedEvent } from '@domain/events/order-payment.events';
import { v4 as uuidV4 } from 'uuid';

@Injectable()
export class CancelPaymentUseCase {
  constructor(
    private readonly paymentRepository: IPaymentRepository,
    private readonly kafkaProducer: IKafkaProducer,
    private readonly idempotencyService: IdempotencyService,
    private readonly strategyFactory: StrategyFactory,
    private readonly logger: LoggingService,
    private readonly tracer: TracingService,
  ) {}

  /**
   * Cancels a payment given a CancelPaymentDto and idempotency key.
   * @param dto CancelPaymentDto containing the details for the payment cancellation.
   * @param idempotencyKeyString The idempotency key as string.
   */
  async execute(dto: CancelPaymentDto, idempotencyKeyString: string) {
    return await this.tracer.startActiveSpan(
      'CancelPaymentUseCase.execute',
      async (span) => {
        try {
          this.logger.debug(`Handling payment cancellation`, {
            ctx: 'CancelPaymentUseCase',
          });

          const provider = mapProviderToPaymentProvider(dto.provider);

          span.setAttributes({
            'provider.order.id': dto.providerOrderId,
            provider: provider,
          });

          const idempotencyKey = new IdempotencyKey(idempotencyKeyString);

          return await this.idempotencyService.check(
            idempotencyKey,
            async () => {
              const payment =
                await this.paymentRepository.findByProviderOrderId(
                  dto.providerOrderId,
                );

              if (!payment) {
                throw new OrderNotFoundException(
                  `Provider Order not found with Id ${dto.providerOrderId}`,
                );
              }

              if (payment.status !== PaymentStatus.PENDING) {
                this.logger.warn(
                  `Payment with transaction Id ${dto.providerOrderId} cannot be cancelled because it is already marked as ${payment.status.toUpperCase()}. Only PENDING payments can be cancelled.`,
                  { ctx: CancelPaymentUseCase.name },
                );
                throw new BadRequestException(
                  'Cannot cancel payment in current status',
                );
              }

              const paymentProvider =
                this.strategyFactory.getStrategy(provider);

              const response = await retry(
                () =>
                  paymentProvider.cancelPayment(
                    dto.providerOrderId,
                    dto.reason,
                  ),
                { retries: 3, delay: 1000, backoff: 'EXPONENTIAL' },
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

              await this.paymentRepository.update(payment);

              await this.kafkaProducer.produce<OrderPaymentFailedEvent>(
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

              this.logger.debug(
                `Payment Cancelled: ${payment.id} with status ${payment.status}`,
                { ctx: 'CancelPaymentUseCase' },
              );

              return {
                paymentId: payment.id,
                providerOrderId: payment.providerOrderId,
                status: payment.status,
              };
            },
          );
        } catch (error: unknown) {
          const errMsg = error instanceof Error ? error.message : String(error);
          this.logger.error(`Failed to process payment: ${errMsg}`, {
            error,
            ctx: 'CancelPaymentUseCase',
          });

          throw error;
        }
      },
    );
  }
}
