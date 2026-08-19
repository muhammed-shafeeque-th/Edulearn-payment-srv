import { Controller } from '@nestjs/common';
import {
  EventPattern,
  Payload,
  Ctx,
  KafkaContext,
} from '@nestjs/microservices';
import { KafkaTopics } from 'src/shared/event-topics';
import { PaymentEventConsumer } from '@application/consumers/payment-event.consumer';
import { PaymentProviderEvent } from '@domain/events/payment-provider.event';
import { ILoggerService } from '@application/ports/logger.service';
import { ITraceService } from '@application/ports/trace.service';

@Controller()
export class KafkaController {
  constructor(
    private readonly paymentWebhookEventConsumer: PaymentEventConsumer,
    private readonly _logger: ILoggerService,
    // private readonly _metrics: MetricsService,
    private readonly _tracer: ITraceService,
  ) {}

  @EventPattern(KafkaTopics.PaymentProviderEvents)
  async handlePaymentProviderEvent(
    @Payload() payload: PaymentProviderEvent,
    @Ctx() context: KafkaContext,
  ): Promise<void> {
    await this._tracer.startActiveSpan(
      'KafkaController.handlePaymentProviderEvent',
      async (span) => {
        span.setAttributes({
          providerEventId: payload.providerEventId,
          provider: payload.provider,
        });
        try {
          this._logger.info(
            `Received Kafka event ${KafkaTopics.PaymentProviderEvents} in handlePaymentProviderEvent`,
            {
              event: payload,
              partition: context.getPartition(),
              topic: context.getTopic(),
              offset: context.getMessage().offset,
            },
          );

          await this.paymentWebhookEventConsumer.handle(payload);

          this._logger.info(
            `Kafka event processed successfully for ${KafkaTopics.PaymentProviderEvents} in handlePaymentProviderEvent`,
            {
              event: payload,
              partition: context.getPartition(),
              topic: context.getTopic(),
              offset: context.getMessage().offset,
            },
          );
        } catch (error) {
          this._logger.error(
            `Error handling Kafka event in handlePaymentProviderEvent`,
            {
              error: (error as Error)?.message,
              stack: (error as Error)?.stack,
              event: payload,
            },
          );
          throw error;
        }
      },
    );
  }
}
