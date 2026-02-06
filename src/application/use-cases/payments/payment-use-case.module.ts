import { AuthModule } from '@infrastructure/auth/auth.module';
import { KafkaModule } from '@infrastructure/kafka/kafka.module';
import { StrategyModule } from '@infrastructure/strategies/strategy.module';
import { Module } from '@nestjs/common';
import { IdempotencyService } from '@infrastructure/services/idempotency.service';
import { DatabaseRepositoryModule } from '@infrastructure/database/database-repository.module';
import { RedisModule } from '@infrastructure/redis/redis.module';
import { CreatePaymentUseCase } from '@application/use-cases/payments/create-payment.use-case';
import { ResolvePaymentUseCase } from '@application/use-cases/payments/resolve-payment.use-case';
import { CancelPaymentUseCase } from '@application/use-cases/payments/cancel-payment.use-case';
import { GrpcClientsModule } from '@infrastructure/grpc/clients/grpc-clients.module';
import { ExchangeModule } from '@infrastructure/exchange/exchange.module';
import { HandlePaymentTimeoutUseCase } from './handle-payment-timeout.use-case';
import { SuccessPaymentUseCase } from './success-payment.use-case';
import { PaymentFailureUseCase } from './payment-failure.use-case';

@Module({
  imports: [
    DatabaseRepositoryModule,
    GrpcClientsModule,
    KafkaModule,
    RedisModule,
    StrategyModule,
    AuthModule,

    ExchangeModule,
  ],
  providers: [
    CreatePaymentUseCase,
    SuccessPaymentUseCase,
    PaymentFailureUseCase,
    ResolvePaymentUseCase,
    CancelPaymentUseCase,
    HandlePaymentTimeoutUseCase,
    IdempotencyService,
  ],
  exports: [
    CreatePaymentUseCase,
    SuccessPaymentUseCase,
    PaymentFailureUseCase,
    ResolvePaymentUseCase,
    CancelPaymentUseCase,
    HandlePaymentTimeoutUseCase,
  ],
})
export class PaymentUseCaseModule {}
