export type KafkaMessageObject<T> = {
  key?: string;
  value: T;
  headers?: any;
};

export abstract class IKafkaProducer {
  abstract produce<T = Record<string, any>>(
    topic: string,
    message: KafkaMessageObject<T>,
  ): Promise<void>;
}
