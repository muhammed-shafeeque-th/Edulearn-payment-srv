import { KafkaModule } from '@infrastructure/kafka/kafka.module';
import { Module } from '@nestjs/common';
import { DatabaseRepositoryModule } from '@infrastructure/database/database-repository.module';
import { RedisModule } from '@infrastructure/redis/redis.module';
import { ScheduleModule } from '@nestjs/schedule';
import { PaymentTimeoutSweeper } from './payment-timeout-sweeper';
import { HandlePaymentTimeoutUseCase } from '@application/use-cases/payments/handle-payment-timeout.use-case';

@Module({
  imports: [
    DatabaseRepositoryModule,
    KafkaModule,
    RedisModule,
    ScheduleModule.forRoot(),
  ],
  providers: [HandlePaymentTimeoutUseCase, PaymentTimeoutSweeper],
  exports: [HandlePaymentTimeoutUseCase, PaymentTimeoutSweeper],
})
export class PaymentSchedulerModule {}
