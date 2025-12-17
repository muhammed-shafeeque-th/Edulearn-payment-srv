import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Kafka, Consumer } from 'kafkajs';
import { AppConfigService } from '@infrastructure/config/config.service';
import { HandlePaymentEventUseCase } from '@application/use-cases/handle-payment-events/handle-payment-event.use-case';
import {
  PaymentEventSchema,
  RefundEventSchema,
} from '@infrastructure/kafka/avro.types';
import { LoggingService } from '@infrastructure/observability/logging/logging.service';
import { TracingService } from '@infrastructure/observability/tracing/trace.service';

@Injectable()
export class KafkaConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly consumer: Consumer;

  constructor(
    private readonly configService: AppConfigService,
    private readonly handlePaymentEventUseCase: HandlePaymentEventUseCase,
    private readonly logger: LoggingService,
    private readonly tracer: TracingService,
  ) {
    const kafka = new Kafka({
      clientId: this.configService.kafkaClientId,
      brokers: this.configService.kafkaBrokers,
    });
    this.consumer = kafka.consumer({
      groupId: this.configService.kafkaConsumerGroup,
      maxBytesPerPartition: this.configService.kafkaFetchMaxBytes,
    });
  }

  async onModuleInit() {
    await this.consumer.connect();
    this.logger.log('Kafka consumer connected', { ctx: 'KafkaConsumer' });

    await this.consumer.subscribe({
      topics: ['payment-service.payment.webhooks'],
      fromBeginning: false,
    });

    await this.consumer.run({
      eachMessage: async ({ topic, message, heartbeat }) => {
        await this.tracer.startActiveSpan(
          'KafkaConsumer.processMessage',
          async (span) => {
            span.setAttributes({ 'event.topic': topic });
            try {
              const event = message.value
                ? topic.includes('payment')
                  ? PaymentEventSchema.fromBuffer(message.value)
                  : RefundEventSchema.fromBuffer(message.value)
                : null;

              if (!event) {
                this.logger.error('Received empty Kafka message', {
                  ctx: 'KafkaConsumer',
                });
                return;
              }

              await this.handlePaymentEventUseCase.execute(event);
              await heartbeat();

              // // Update consumer lag metric using fetchOffsets workaround
              // const offset = parseInt(message.offset, 10);
              // const latestOffsets = await this.consumer.fetchOffsets({ topic });
              // const partitionOffset = latestOffsets.find(
              //   (o) => o.partition === partition,
              // )?.offset;
              // const lag = partitionOffset
              //   ? parseInt(partitionOffset, 10) - offset
              //   : 0;
              // kafkaConsumerLag.set({ topic, partition }, lag);
            } catch (error: any) {
              this.logger.error(
                `Failed to process Kafka message: ${error.message}`,
                { error, ctx: 'KafkaConsumer' },
              );
              throw error; // Let Kafka retry the message
            } finally {
              span.end();
            }
          },
        );
      },
    });
  }

  async onModuleDestroy() {
    await this.consumer.disconnect();
    this.logger.log('Kafka consumer disconnected', { ctx: 'KafkaConsumer' });
  }
}
