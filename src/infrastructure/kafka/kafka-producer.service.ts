import {
  Inject,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';
import { KAFKA_CLIENT } from './constants';
import {
  IKafkaProducer,
  KafkaMessageObject,
} from '@application/ports/kafka-producer.interface';
import { ILoggerService } from '@application/ports/logger.service';
import { ITraceService } from '@application/ports/trace.service';

@Injectable()
export class KafkaProducerImpl
  implements IKafkaProducer, OnModuleInit, OnModuleDestroy
{
  constructor(
    @Inject(KAFKA_CLIENT) private readonly kafkaClient: ClientKafka,
    private readonly _logger: ILoggerService,
    private readonly _tracer: ITraceService,
  ) {}

  async onModuleInit() {
    await this.kafkaClient.connect();
    this._logger.info(`Kafka client connected ${KafkaProducerImpl.name}`);
  }

  async onModuleDestroy() {
    await this.kafkaClient.close();
    this._logger.info(`Kafka client disconnected ${KafkaProducerImpl.name}`);
  }

  async produce<T = any>(topic: string, message: KafkaMessageObject<T>) {
    return await this._tracer.startActiveSpan(
      'KafkaProducerImpl.produce',
      async (span) => {
        try {
          span.setAttribute('kafka.topic', topic);
          span.setAttribute('kafka.message', JSON.stringify(message));

          // emit() returns an Observable, so we convert to Promise
          await lastValueFrom(this.kafkaClient.emit(topic, message));
          // this._logger.info(
          //   `Message send to topic ${topic}: ${JSON.stringify(message)}`,
          //   { ctx: KafkaProducerImpl.name },
          // );
        } catch (error: any) {
          this._logger.error(
            `Failed to send message to topic ${topic}: ${error.message}`,
            { ctx: KafkaProducerImpl.name, error },
          );
          throw error;
        }
      },
    );
  }
}
