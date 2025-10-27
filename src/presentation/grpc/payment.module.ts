import { AuthModule } from '@infrastructure/auth/auth.module';
import { KafkaModule } from '@infrastructure/kafka/kafka.module';
import { StrategyModule } from '@infrastructure/strategies/strategy.module';
import { Module } from '@nestjs/common';
import { PaymentController } from './payment.controller';
import { ProcessRefundUseCase } from '@application/use-cases/refunds/process-refund.use-case';
import { IdempotencyService } from '@application/services/idempotency.service';
import { DatabaseRepositoryModule } from '@infrastructure/database/database-repository.module';
import { RedisModule } from '@infrastructure/redis/redis.module';
import { GrpcClientsModule } from '../../infrastructure/grpc/clients/grpc-clients.module';
import { CreatePaymentUseCase } from '@application/use-cases/payments/create-payment.use-case';
import { CapturePaypalPaymentUseCase } from '@application/use-cases/payments/capture-paypal-payment.use-case';
import { VerifyRazorpayPaymentUseCase } from '@application/use-cases/payments/verify-razorpay-payment.use-case';

@Module({
  imports: [
    DatabaseRepositoryModule,
    GrpcClientsModule,
    KafkaModule,
    RedisModule,
    StrategyModule,
    AuthModule,
  ],
  controllers: [PaymentController],
  providers: [
    CreatePaymentUseCase,
    CapturePaypalPaymentUseCase,
    VerifyRazorpayPaymentUseCase,
    ProcessRefundUseCase,
    ProcessRefundUseCase,
    IdempotencyService,
  ],
})
export class PaymentModule {}
