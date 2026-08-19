import { Injectable } from '@nestjs/common';
import { IdempotencyKey } from '@domain/value-objects/idempotency-key';
import { IPaymentRepository } from '@domain/repositories/payment-repository.interface';
// import { IKafkaProducer } from '@application/ports/kafka-producer.interface';
import { withRetry } from '@edulearn/core';
import { PaymentProvider } from '@domain/entities/payments';
import { GatewayFactory } from '@infrastructure/strategies/gateway.factory';
import { ResolvePaymentDto } from 'src/presentation/grpc/dtos/resolve-payment.dto';
import { mapProviderToPaymentProvider } from 'src/shared/utils/mapProviderToDomain';
import { ResolvePaymentRequest } from '@application/ports/payment-gateway-strategy.interface';
import { ProviderSessionStatus } from '@domain/entities/payment-provider-sesssion.entity';
import { PaymentNotFoundException } from '@domain/exceptions/domain.exceptions';
import { ILoggerService } from '@application/ports/logger.service';
import { ITraceService } from '@application/ports/trace.service';
import { IMetricService } from '@application/ports/metric.service';
import { IResolvePaymentUseCase } from '../interfaces/resolve-payment.inteface';
import { IIdempotencyService } from '@application/ports/idempotency.service';
// import { KafkaTopics } from 'src/shared/event-topics';
// import { OrderPaymentSuccessEvent } from '@domain/events/domain-events';
// import { v4 as uuidV4 } from 'uuid';

@Injectable()
export class ResolvePaymentUseCase implements IResolvePaymentUseCase {
  constructor(
    private readonly _paymentRepository: IPaymentRepository,
    //
    private readonly _idempotencyService: IIdempotencyService,
    private readonly _strategyFactory: GatewayFactory,
    private readonly _logger: ILoggerService,
    private readonly _tracer: ITraceService,
    private readonly _metrics: IMetricService,
  ) {}

  async execute(dto: ResolvePaymentDto, idempotencyKey: string) {
    return await this._tracer.startActiveSpan(
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

          this._logger.debug(
            `Executing ResolvePaymentUseCase  provider=${provider}]`,
          );

          const idempotency_Key = new IdempotencyKey(idempotencyKey);
          return this._idempotencyService.check(idempotency_Key, async () => {
            const paypalGateway = this._strategyFactory.getGateway(provider);

            const payment = await this._paymentRepository.findByProviderOrderId(
              providerOrderId!,
            );

            if (!payment) {
              this._logger.warn(
                `Payment not found with providerOrderId=${providerOrderId}.`,
              );
              throw new PaymentNotFoundException(
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

            const ResolveResult = await withRetry(
              () => {
                return paypalGateway.resolvePayment(ResolvePayload!);
              },
              { maxAttempts: 3, initialDelay: 1000 },
            );

            const session = payment.getSessionByProviderSessionId(
              providerOrderId!,
            );
            session?.updateStatus(ProviderSessionStatus.CAPTURED);

            if (!payment.isTerminalState()) {
              payment.markResolved();
            }

            await this._paymentRepository.update(payment);
            this._logger.debug(
              `Payment updated: ${payment.id} with status ${payment.status}`,
              { ctx: 'ResolvePaymentUseCase' },
            );

            // await this._kafkaProducer.produce<OrderPaymentSuccessEvent>(
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

            this._metrics.incPaymentCounter({
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
          this._logger.error(`Failed to process payment: ${error.message}`, {
            error,
            ctx: 'ResolvePaymentUseCase',
          });
          this._metrics.incPaymentCounter({
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
