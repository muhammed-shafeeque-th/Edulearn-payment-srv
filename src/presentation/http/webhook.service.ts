import { Injectable } from '@nestjs/common';
import { IKafkaProducer } from '@domain/interfaces/kafka-producer.interface';
import { TracingService } from '@infrastructure/observability/tracing/trace.service';
import { LoggingService } from '@infrastructure/observability/logging/logging.service';
import { KAFKA_TOPICS } from '@infrastructure/kafka/kafka.topics';

@Injectable()
export class WebhookService {
  constructor(
    private readonly kafkaProducer: IKafkaProducer,
    private readonly logger: LoggingService,
    private readonly tracer: TracingService,
  ) {}

  async handleWebhookEvent(event: any): Promise<void> {
    return await this.tracer.startActiveSpan(
      'WebhookService.handleWebhookEvent',
      async (span) => {
        span.setAttribute('event.type', event.type);
        try {
          this.logger.log(`Handling webhook event: ${event.eventType}`, {
            ctx: 'WebhookService',
          });

          // Forward to Kafka for asynchronous processing
          if (event.eventType.includes('PAYMENT')) {
            await this.kafkaProducer.send(KAFKA_TOPICS.PAYMENT_PAYMENT_CREATE, {
              paymentId: event.paymentId,
              userId: event.userId,
              orderId: event.orderId,
              amount: event.amount,
              status: event.status,
              transactionId: event.transactionId,
              eventType: event.eventType,
            });
          } else if (event.eventType.includes('REFUND')) {
            await this.kafkaProducer.send(KAFKA_TOPICS.PAYMENT_PAYMENT_CREATE, {
              refundId: event.refundId || 'unknown',
              paymentId: event.paymentId,
              userId: event.userId,
              amount: event.amount,
              status: event.status,
              transactionId: event.transactionId,
              eventType: event.eventType,
            });
          }

          this.logger.log(
            `Webhook event forwarded to Kafka: ${event.eventType}`,
            { ctx: 'WebhookService' },
          );
        } catch (error: any) {
          this.logger.error(
            `Failed to handle webhook event: ${error.message}`,
            { error, ctx: 'WebhookService' },
          );
          throw error;
        }
      },
    );
  }
}
