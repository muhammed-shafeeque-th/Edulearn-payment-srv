import { Injectable, NotFoundException } from '@nestjs/common';
import { IdempotencyKey } from '@domain/value-objects/idempotency-key';
import { IPaymentRepository } from '@domain/repositories/payment-repository.interface';
// import { IKafkaProducer } from '@application/adaptors/kafka-producer.interface';
import { retry } from 'ts-retry-promise';
import { LoggingService } from '@infrastructure/observability/logging/logging.service';
import { TracingService } from '@infrastructure/observability/tracing/trace.service';
import { MetricsService } from '@infrastructure/observability/metrics/metrics.service';
import { PaymentProvider } from '@domain/entities/payments';
import { StrategyFactory } from '@infrastructure/strategies/strategy.factory';
import { IdempotencyService } from '@infrastructure/services/idempotency.service';
import { ResolvePaymentDto } from 'src/presentation/grpc/dtos/resolve-payment.dto';
import { mapProviderToPaymentProvider } from 'src/shared/utils/mapProviderToDomain';
import { ResolvePaymentRequest } from '@application/adaptors/payment-strategy.interface';
import { ProviderSessionStatus } from '@domain/entities/payment-provider-sesssion.entity';
// import { KafkaTopics } from 'src/shared/event-topics';
// import { OrderPaymentSuccessEvent } from '@domain/events/domain-events';
// import { v4 as uuidV4 } from 'uuid';

@Injectable()
export class ResolvePaymentUseCase {
  constructor(
    private readonly paymentRepository: IPaymentRepository,
    //
    private readonly idempotencyService: IdempotencyService,
    private readonly strategyFactory: StrategyFactory,
    private readonly logger: LoggingService,
    private readonly tracer: TracingService,
    private readonly metrics: MetricsService,
  ) {}

  async execute(dto: ResolvePaymentDto, idempotencyKey: string) {
    return await this.tracer.startActiveSpan(
      'ResolvePaymentUseCase.execute',
      async (span) => {
        try {
          const provider = mapProviderToPaymentProvider(dto.provider);

          const providerOrderId =
            dto.paypal?.orderId ||
            dto.razorpay?.razorpayOrderId ||
            dto.stripe?.sessionId;

          span.setAttributes({
            'idempotency.key': idempotencyKey,
            provider,
          });

          this.logger.debug(
            `Executing ResolvePaymentUseCase  provider=${provider}]`,
          );

          const idempotency_Key = new IdempotencyKey(idempotencyKey);
          return this.idempotencyService.check(idempotency_Key, async () => {
            const paypalStrategy = this.strategyFactory.getStrategy(provider);

            const payment = await this.paymentRepository.findByProviderOrderId(
              providerOrderId!,
            );

            if (!payment) {
              this.logger.warn(
                `Payment not found with providerOrderId=${providerOrderId}.`,
              );
              throw new NotFoundException(
                'Payment not found with Id ' + providerOrderId,
              );
            }

            let ResolvePayload: ResolvePaymentRequest;
            if (provider === PaymentProvider.PAYPAL) {
              ResolvePayload = {
                idempotencyKey,
                providerOrderId: dto.paypal!.orderId!,
              };
            } else if (provider === PaymentProvider.RAZORPAY) {
              ResolvePayload = {
                orderId: dto.razorpay!.razorpayOrderId,
                paymentId: dto.razorpay!.razorpayPaymentId,
                signature: dto.razorpay!.razorpaySignature,
              };
            } else if (provider === PaymentProvider.STRIPE) {
              ResolvePayload = { ...dto.stripe! };
            }

            const ResolveResult = await retry(
              () => {
                return paypalStrategy.resolvePayment(ResolvePayload!);
              },
              { retries: 3, delay: 1000, backoff: 'EXPONENTIAL' },
            );

            const session = payment.getSessionByProviderSessionId(
              providerOrderId!,
            );
            session?.updateStatus(ProviderSessionStatus.CAPTURED);

            if (!payment.isTerminalState()) {
              payment.markResolved();
            }

            await this.paymentRepository.update(payment);
            this.logger.debug(
              `Payment updated: ${payment.id} with status ${payment.status}`,
              { ctx: 'ResolvePaymentUseCase' },
            );

            // await this.kafkaProducer.produce<OrderPaymentSuccessEvent>(
            //   KafkaTopics.PaymentOrderSucceeded,
            //   {
            //     eventId: uuidV4(),
            //     eventType: 'OrderPaymentSuccessEvent',
            //     paymentId: payment.id,
            //     orderId: payment.orderId,
            //     provider,
            //     userId: payment.userId,
            //     providerOrderId: payment.providerOrderId,
            //     paymentStatus: payment.status,
            //     timestamp: payment.updatedAt.getTime(),
            //   },
            // );

            this.metrics.incPaymentCounter({
              method: 'payment_capture',
              status: payment.status,
              gateway: provider,
            });

            return {
              providerStatus: ResolveResult.providerStatus,
              isVerified: ResolveResult.isVerified,
              paymentId: payment.id,
              orderId: payment.orderId,
              provider: provider,
            };
          });
        } catch (error: any) {
          this.logger.error(`Failed to process payment: ${error.message}`, {
            error,
            ctx: 'ResolvePaymentUseCase',
          });
          this.metrics.incPaymentCounter({
            method: 'payment_capture',
            status: 'FAILED',
            gateway: PaymentProvider.PAYPAL,
          });
          throw error;
        }
      },
    );
  }
}
