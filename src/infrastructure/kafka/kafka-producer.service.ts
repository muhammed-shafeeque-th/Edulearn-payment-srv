import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Kafka, Producer } from 'kafkajs';
import { LoggingService } from 'src/infrastructure/observability/logging/logging.service';
import { AppConfigService } from '../config/config.service';
import { TracingService } from '../observability/tracing/trace.service';
import { IKafkaProducer } from '@application/adaptors/kafka-producer.interface';

@Injectable()
export class IKafkaProducerImpl
  implements IKafkaProducer, OnModuleInit, OnModuleDestroy
{
  private producer: Producer;
  constructor(
    private readonly configService: AppConfigService,
    private readonly logger: LoggingService,
    private readonly tracer: TracingService,
  ) {
    const kafka = new Kafka({
      clientId: this.configService.kafkaClientId,
      brokers: this.configService.kafkaBrokers,
    });
    this.producer = kafka.producer();
  }

  async onModuleInit() {
    await this.producer.connect();
    this.logger.info(`Kafka Producer connected ${IKafkaProducerImpl.name}`);
  }

  async onModuleDestroy() {
    await this.producer.disconnect();
    this.logger.info(`Kafka Producer disconnected ${IKafkaProducerImpl.name}`);
  }

  async produce(topic: string, message: any) {
    return await this.tracer.startActiveSpan(
      'IKafkaProducerImpl.produce',
      async (span) => {
        try {
          span.setAttribute('kafka.topic', topic);
          span.setAttribute('kafka.message', JSON.stringify(message));

          await this.producer.send({
            topic,
            messages: [{ value: JSON.stringify(message) }],
          });
          this.logger.info(
            `Message send to topic ${topic}: ${JSON.stringify(message)}`,
            { ctx: IKafkaProducerImpl.name },
          );
        } catch (error: any) {
          this.logger.error(
            `Failed to send message to topic ${topic}: ${error.message}`,
            { ctx: IKafkaProducerImpl.name, error },
          );
          throw error;
        }
      },
    );
  }
}
