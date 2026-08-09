import { AuthModule } from '@infrastructure/auth/auth.module';
import { KafkaModule } from '@infrastructure/kafka/kafka.module';
import { StrategyModule } from '@infrastructure/strategies/strategy.module';
import { Module } from '@nestjs/common';
import { IdempotencyService } from '@infrastructure/services/idempotency.service';
import { DatabaseRepositoryModule } from '@infrastructure/database/database-repository.module';
import { RedisModule } from '@infrastructure/redis/redis.module';
import { CreatePaymentUseCase } from '@application/use-cases/payments/impls/create-payment.use-case';
import { CreateProviderSessionUseCase } from '@application/use-cases/payments/impls/create-provider-session.use-case';
import { ResolvePaymentUseCase } from '@application/use-cases/payments/impls/resolve-payment.use-case';
import { CancelPaymentUseCase } from '@application/use-cases/payments/impls/cancel-payment.use-case';
import { GrpcClientsModule } from '@infrastructure/grpc/clients/grpc-clients.module';
import { ExchangeModule } from '@infrastructure/exchange/exchange.module';
import { HandlePaymentTimeoutUseCase } from './handle-payment-timeout.use-case';
import { SuccessPaymentUseCase } from './success-payment.use-case';
import { PaymentFailureUseCase } from './payment-failure.use-case';
import { ICreatePaymentUseCase } from '../interfaces/create-payment.interface';
import { ICreateProviderSessionUseCase } from '../interfaces/create-provider-session.interface';
import { ISuccessPaymentUseCase } from '../interfaces/success-payment.interface';
import { IPaymentFailureUseCase } from '../interfaces/payment-failure.interface';
import { IResolvePaymentUseCase } from '../interfaces/resolve-payment.inteface';
import { ICancelPaymentUseCase } from '../interfaces/cancel-payment.interface';
import { IHandlePaymentTimeoutUseCase } from '../interfaces/handle-payment-timeout.inteface';
import { IIdempotencyService } from '@application/adaptors/idempotency.service';

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
    { provide: ICreatePaymentUseCase, useClass: CreatePaymentUseCase },
    {
      provide: ICreateProviderSessionUseCase,
      useClass: CreateProviderSessionUseCase,
    },
    { provide: ISuccessPaymentUseCase, useClass: SuccessPaymentUseCase },
    { provide: IPaymentFailureUseCase, useClass: PaymentFailureUseCase },
    { provide: IResolvePaymentUseCase, useClass: ResolvePaymentUseCase },
    { provide: ICancelPaymentUseCase, useClass: CancelPaymentUseCase },
    {
      provide: IHandlePaymentTimeoutUseCase,
      useClass: HandlePaymentTimeoutUseCase,
    },
    { provide: IIdempotencyService, useClass: IdempotencyService },
  ],
  exports: [
    ICreatePaymentUseCase,
    ICreateProviderSessionUseCase,
    ISuccessPaymentUseCase,
    IPaymentFailureUseCase,
    IResolvePaymentUseCase,
    ICancelPaymentUseCase,
    IHandlePaymentTimeoutUseCase,
  ],
})
export class PaymentUseCaseModule {}
