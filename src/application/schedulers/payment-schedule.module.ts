import { KafkaModule } from '@infrastructure/kafka/kafka.module';
import { Module } from '@nestjs/common';
import { DatabaseRepositoryModule } from '@infrastructure/database/database-repository.module';
import { RedisModule } from '@infrastructure/redis/redis.module';
import { ScheduleModule } from '@nestjs/schedule';
import { PaymentTimeoutSweeper } from './payment-timeout-sweeper';
import { HandlePaymentTimeoutUseCase } from '@application/use-cases/payments/impls/handle-payment-timeout.use-case';
import { IHandlePaymentTimeoutUseCase } from '@application/use-cases/payments/interfaces/handle-payment-timeout.inteface';

@Module({
  imports: [
    DatabaseRepositoryModule,
    KafkaModule,
    RedisModule,
    ScheduleModule.forRoot(),
  ],
  providers: [
    {
      provide: IHandlePaymentTimeoutUseCase,
      useClass: HandlePaymentTimeoutUseCase,
    },
    PaymentTimeoutSweeper,
  ],
  exports: [IHandlePaymentTimeoutUseCase, PaymentTimeoutSweeper],
})
export class PaymentSchedulerModule {}
