import { BaseEventType } from '@domain/events/base-event';

export abstract class IKafkaProducer {
  abstract produce<T = Record<string, any>>(
    topic: string,
    message: T & BaseEventType,
  ): Promise<void>;
}
