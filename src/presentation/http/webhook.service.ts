import { IKafkaProducer } from '@application/adaptors/kafka-producer.interface';
import { PaymentProviderEvent } from '@domain/events/payment-provider.event';
import { LoggingService } from '@infrastructure/observability/logging/logging.service';
import { Injectable } from '@nestjs/common';
import { KafkaTopics } from 'src/shared/event-topics';

@Injectable()
export class WebhookService {
  constructor(
    private readonly kafka: IKafkaProducer,
    private readonly logger: LoggingService,
  ) {}

  async publish(event: PaymentProviderEvent): Promise<void> {
    await this.kafka.produce(KafkaTopics.PaymentProviderEvents, {
      key: event.provider,
      value: {
        eventId: `${event.provider}:${event.providerEventId}`, // idempotency hint
        eventType: 'PaymentProviderEvent',
        timestamp: Date.now(),
        ...event,
      },
    });

    this.logger.debug(`Webhook event published ${event.providerEventType}`, {
      provider: event.provider,
      eventId: event.providerEventId,
    });
  }
}
