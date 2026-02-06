import { Module } from '@nestjs/common';
import { KafkaController } from './kafka.controller';
import { EventConsumersModule } from '@application/consumers/event-consumer.module';

@Module({
  imports: [EventConsumersModule],
  controllers: [KafkaController],
})
export class KafkaPresentationModule {}
