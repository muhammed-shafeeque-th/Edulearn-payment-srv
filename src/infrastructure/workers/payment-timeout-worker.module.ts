import { Module } from '@nestjs/common';
import { RedisModule } from '@infrastructure/redis/redis.module';
import { PaymentUseCaseModule } from '@application/use-cases/payments/payment-use-case.module';
import { PaymentTimeoutRedisWorker } from './payment-timeout-redis.worker';

@Module({
  imports: [RedisModule, PaymentUseCaseModule],
  providers: [PaymentTimeoutRedisWorker],
})
export class PaymentTimeoutWorkerModule {}
