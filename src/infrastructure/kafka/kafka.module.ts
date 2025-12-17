import { Module } from '@nestjs/common';
import { IKafkaProducerImpl } from './kafka-producer.service';
import { KafkaConsumer } from './kafka-consumer';
import { HandlePaymentEventUseCase } from '@application/use-cases/handle-payment-events/handle-payment-event.use-case';
import { IKafkaProducer } from '@application/adaptors/kafka-producer.interface';
import { DatabaseRepositoryModule } from '@infrastructure/database/database-repository.module';

@Module({
  imports: [DatabaseRepositoryModule],
  providers: [
    { provide: IKafkaProducer, useClass: IKafkaProducerImpl },
    KafkaConsumer,
    HandlePaymentEventUseCase,
  ],
  exports: [IKafkaProducer],
})
export class KafkaModule {}
