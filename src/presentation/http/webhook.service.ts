import { IKafkaProducer } from '@application/ports/kafka-producer.interface';
import { ILoggerService } from '@application/ports/logger.service';
import { PaymentProviderEvent } from '@domain/events/payment-provider.event';
import { Injectable } from '@nestjs/common';
import { KafkaTopics } from 'src/shared/event-topics';

@Injectable()
export class WebhookService {
  constructor(
    private readonly kafka: IKafkaProducer,
    private readonly _logger: ILoggerService,
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

    this._logger.debug(`Webhook event published ${event.providerEventType}`, {
      provider: event.provider,
      eventId: event.providerEventId,
    });
  }
}
