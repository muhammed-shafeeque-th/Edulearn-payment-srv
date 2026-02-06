import {
  Inject,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { LoggingService } from 'src/infrastructure/observability/logging/logging.service';
import { TracingService } from '../observability/tracing/trace.service';
import { ClientKafka } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';
import { KAFKA_CLIENT } from './constants';
import {
  IKafkaProducer,
  KafkaMessageObject,
} from '@application/adaptors/kafka-producer.interface';

@Injectable()
export class KafkaProducerImpl
  implements IKafkaProducer, OnModuleInit, OnModuleDestroy
{
  constructor(
    @Inject(KAFKA_CLIENT) private readonly kafkaClient: ClientKafka,
    private readonly logger: LoggingService,
    private readonly tracer: TracingService,
  ) {}

  async onModuleInit() {
    await this.kafkaClient.connect();
    this.logger.info(`Kafka client connected ${KafkaProducerImpl.name}`);
  }

  async onModuleDestroy() {
    await this.kafkaClient.close();
    this.logger.info(`Kafka client disconnected ${KafkaProducerImpl.name}`);
  }

  async produce<T = any>(topic: string, message: KafkaMessageObject<T>) {
    return await this.tracer.startActiveSpan(
      'KafkaProducerImpl.produce',
      async (span) => {
        try {
          span.setAttribute('kafka.topic', topic);
          span.setAttribute('kafka.message', JSON.stringify(message));

          // emit() returns an Observable, so we convert to Promise
          await lastValueFrom(this.kafkaClient.emit(topic, message));
          // this.logger.info(
          //   `Message send to topic ${topic}: ${JSON.stringify(message)}`,
          //   { ctx: KafkaProducerImpl.name },
          // );
        } catch (error: any) {
          this.logger.error(
            `Failed to send message to topic ${topic}: ${error.message}`,
            { ctx: KafkaProducerImpl.name, error },
          );
          throw error;
        }
      },
    );
  }
}
