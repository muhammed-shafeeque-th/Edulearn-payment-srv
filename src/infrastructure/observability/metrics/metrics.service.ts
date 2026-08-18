import { Injectable } from '@nestjs/common';
import { CounterMetric, GaugeMetric, HistogramMetric } from '@edulearn/core';
import { MetricsService } from '@edulearn/nest';
import { IMetricService } from 'src/application/adaptors/metric.service';

@Injectable()
export class MetricService implements IMetricService {
  private readonly paymentCounter: CounterMetric;
  readonly paymentLatency: HistogramMetric;
  private readonly webhookEvents: CounterMetric;
  private readonly kafkaConsumerLag: GaugeMetric;
  private readonly databaseQueryLatency: HistogramMetric;
  private readonly redisCacheHitRate: CounterMetric;

  public constructor(private readonly _metric: MetricsService) {
    this.paymentCounter = this._metric.counter({
      name: 'payment_service_requests_total',
      help: 'Total number of payment and refund requests processed',
      labelNames: ['method', 'status', 'gateway'],
    });

    this.paymentLatency = this._metric.histogram({
      name: 'payment_service_request_latency_seconds',
      help: 'Latency of payment and refund requests in seconds',
      labelNames: ['method', 'gateway'],
      buckets: [0.1, 0.5, 1, 2, 5, 10],
    });

    this.webhookEvents = this._metric.counter({
      name: 'payment_service_webhook_events_total',
      help: 'Total number of webhook events processed',
      labelNames: ['event_type', 'status'],
    });

    this.kafkaConsumerLag = this._metric.gauge({
      name: 'payment_service_kafka_consumer_lag',
      help: 'Kafka consumer lag for payment-service topics',
      labelNames: ['topic', 'partition'],
    });

    this.databaseQueryLatency = this._metric.histogram({
      name: 'payment_service_database_query_latency_seconds',
      help: 'Latency of database queries in seconds',
      labelNames: ['operation'],
      buckets: [0.01, 0.05, 0.1, 0.5, 1, 2],
    });

    this.redisCacheHitRate = this._metric.counter({
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
