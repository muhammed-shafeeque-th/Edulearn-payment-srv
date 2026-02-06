import { Controller } from '@nestjs/common';
import {
  EventPattern,
  Payload,
  Ctx,
  KafkaContext,
} from '@nestjs/microservices';
import { LoggingService } from '@infrastructure/observability/logging/logging.service';
// import { MetricsService } from '@infrastructure/observability/metrics/metrics.service';
import { TracingService } from '@infrastructure/observability/tracing/trace.service';
import { KafkaTopics } from 'src/shared/event-topics';
import { PaymentEventConsumer } from '@application/consumers/payment-event.consumer';
import { PaymentProviderEvent } from '@domain/events/payment-provider.event';

@Controller()
export class KafkaController {
  constructor(
    private readonly paymentWebhookEventConsumer: PaymentEventConsumer,
    private readonly logger: LoggingService,
    // private readonly metrics: MetricsService,
    private readonly tracer: TracingService,
  ) {}

  @EventPattern(KafkaTopics.PaymentProviderEvents)
  async handlePaymentProviderEvent(
    @Payload() payload: PaymentProviderEvent,
    @Ctx() context: KafkaContext,
  ): Promise<void> {
    await this.tracer.startActiveSpan(
      'KafkaController.handlePaymentProviderEvent',
      async (span) => {
        span.setAttributes({
          providerEventId: payload.providerEventId,
          provider: payload.provider,
        });
        try {
          this.logger.info(
            `Received Kafka event ${KafkaTopics.PaymentProviderEvents} in handlePaymentProviderEvent`,
            {
              event: payload,
              partition: context.getPartition(),
              topic: context.getTopic(),
              offset: context.getMessage().offset,
            },
          );

          await this.paymentWebhookEventConsumer.handle(payload);

          this.logger.info(
            `Kafka event processed successfully for ${KafkaTopics.PaymentProviderEvents} in handlePaymentProviderEvent`,
            {
              event: payload,
              partition: context.getPartition(),
              topic: context.getTopic(),
              offset: context.getMessage().offset,
            },
          );
        } catch (error) {
          this.logger.error(
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
