import { Module } from '@nestjs/common';
import { RedisModule } from '@infrastructure/redis/redis.module';
import { PaymentUseCaseModule } from '@application/use-cases/payments/payment-use-case.module';
import { PaymentEventConsumer } from './payment-event.consumer';

@Module({
  imports: [RedisModule, PaymentUseCaseModule],
  providers: [PaymentEventConsumer],
  exports: [PaymentEventConsumer],
})
export class EventConsumersModule {}
