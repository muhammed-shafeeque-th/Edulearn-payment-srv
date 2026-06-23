import { Injectable } from '@nestjs/common';
import { Counter, Histogram, Gauge } from 'prom-client';

@Injectable()
export class MetricsService {
  private readonly paymentCounter: Counter<string>;
  readonly paymentLatency: Histogram<string>;
  private readonly webhookEvents: Counter<string>;
  private readonly kafkaConsumerLag: Gauge<string>;
  private readonly databaseQueryLatency: Histogram<string>;
  private readonly redisCacheHitRate: Counter<string>;

  constructor() {
    this.paymentCounter = new Counter({
      name: 'payment_service_requests_total',
      help: 'Total number of payment and refund requests processed',
      labelNames: ['method', 'status', 'gateway'],
    });

    this.paymentLatency = new Histogram({
      name: 'payment_service_request_latency_seconds',
      help: 'Latency of payment and refund requests in seconds',
      labelNames: ['method', 'gateway'],
      buckets: [0.1, 0.5, 1, 2, 5, 10],
    });

    this.webhookEvents = new Counter({
      name: 'payment_service_webhook_events_total',
      help: 'Total number of webhook events processed',
      labelNames: ['event_type', 'status'],
    });

    this.kafkaConsumerLag = new Gauge({
      name: 'payment_service_kafka_consumer_lag',
      help: 'Kafka consumer lag for payment-service topics',
      labelNames: ['topic', 'partition'],
    });

    this.databaseQueryLatency = new Histogram({
      name: 'payment_service_database_query_latency_seconds',
      help: 'Latency of database queries in seconds',
      labelNames: ['operation'],
      buckets: [0.01, 0.05, 0.1, 0.5, 1, 2],
    });

    this.redisCacheHitRate = new Counter({
      name: 'payment_service_redis_cache_hit_total',
      help: 'Total number of cache hits and misses in Redis',
      labelNames: ['operation', 'status'],
    });
  }

  incPaymentCounter(labels: {
    method: string;
    status: string;
    gateway?: string;
  }): void {
    this.paymentCounter.inc(labels);
  }

  observePaymentLatency(method: string, gateway: string) {
    return this.paymentLatency.startTimer({ method, gateway });
  }

  incWebhookEvents(labels: { event_type: string; status: string }): void {
    this.webhookEvents.inc(labels);
  }

  setKafkaConsumerLag(
    labels: { topic: string; partition: string },
    value: number,
  ): void {
    this.kafkaConsumerLag.set(labels, value);
  }

  observeDatabaseQueryLatency(labels: { operation: string }) {
    return this.databaseQueryLatency.startTimer(labels);
  }

  redisCacheHit(labels: { operation: string; status: 'hit' | 'miss' }): void {
    this.redisCacheHitRate.inc(labels);
  }
}
