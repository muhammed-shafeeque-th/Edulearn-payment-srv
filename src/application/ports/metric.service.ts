export abstract class IMetricService {
  abstract incPaymentCounter(labels: {
    method: string;
    status: string;
    gateway?: string;
  }): void;

  paymentLatency: any;

  abstract observePaymentLatency(
    method: string,
    gateway: string,
  ): (labels?: Partial<Record<string, string | number>> | undefined) => number;

  abstract incWebhookEvents(labels: {
    event_type: string;
    status: string;
  }): void;

  abstract setKafkaConsumerLag(
    labels: { topic: string; partition: string },
    value: number,
  ): void;

  abstract observeDatabaseQueryLatency(labels: {
    operation: string;
  }): (labels?: Partial<Record<string, string | number>> | undefined) => number;

  abstract redisCacheHit(labels: {
    operation: string;
    status: 'hit' | 'miss';
  }): void;
}
