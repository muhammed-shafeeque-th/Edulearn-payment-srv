import { Module } from '@nestjs/common';
import { ConfigModule } from '@infrastructure/config/config.module';
import { RedisModule } from '@infrastructure/redis/redis.module';
import { AuthModule } from '@infrastructure/auth/auth.module';
import { PaymentPresentationModule } from 'src/presentation/grpc/payment.presentation.module';
import { WebhookModule } from 'src/presentation/http/webhook.module';
import { LoggingModule } from '@infrastructure/observability/logging/logging.module';
import { TracingModule } from '@infrastructure/observability/tracing/tracing.module';
import { MetricsModule } from '@infrastructure/observability/metrics/metrics.module';
import { PaymentTimeoutWorkerModule } from '@infrastructure/workers/payment-timeout-worker.module';
import { PaymentSchedulerModule } from '@application/schedulers/payment-schedule.module';
import { KafkaPresentationModule } from './presentation/kafka/kafka-presentation.module';

@Module({
  imports: [
    ConfigModule,

    LoggingModule,
    TracingModule,
    MetricsModule,

    // DatabaseModule,
    // KafkaModule,
    RedisModule,
    AuthModule,
    PaymentPresentationModule,
    WebhookModule,
    KafkaPresentationModule,
    PaymentTimeoutWorkerModule,
    PaymentSchedulerModule,
  ],
})
export class AppModule {}
