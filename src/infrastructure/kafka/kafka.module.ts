import { Module } from '@nestjs/common';
import { KafkaProducerImpl } from './kafka-producer.service';
import { IKafkaProducer } from '@application/adaptors/kafka-producer.interface';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { AppConfigService } from '@infrastructure/config/config.service';
import { KAFKA_CLIENT } from './constants';

@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: KAFKA_CLIENT,
        useFactory: (config: AppConfigService) => ({
          transport: Transport.KAFKA,
          options: {
            client: {
              clientId: config.kafkaClientId || 'payment-service',
              brokers: config.kafkaBrokers,
            },
            producer: {
              maxInFlightRequests: 1,
              idempotent: true,
              retry: {
                retries: 5,
              },
            },
          },
        }),
        inject: [AppConfigService],
      },
    ]),
  ],
  providers: [{ provide: IKafkaProducer, useClass: KafkaProducerImpl }],
  exports: [IKafkaProducer, ClientsModule],
})
export class KafkaModule {}
