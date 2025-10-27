import { Module } from '@nestjs/common';
import { ConfigModule } from '@infrastructure/config/config.module';
// import { DatabaseModule } from '@infrastructure/database/database-entity.module';
// import { KafkaModule } from '@infrastructure/kafka/kafka.module';
import { RedisModule } from '@infrastructure/redis/redis.module';
import { AuthModule } from '@infrastructure/auth/auth.module';
import { ScheduleModule } from '@nestjs/schedule';
import { PaymentModule } from 'src/presentation/grpc/payment.module';
import { WebhookModule } from 'src/presentation/http/webhook.module';
import { LoggingModule } from '@infrastructure/observability/logging/logging.module';
import { TracingModule } from '@infrastructure/observability/tracing/tracing.module';
import { MetricsModule } from '@infrastructure/observability/metrics/metrics.module';

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
    PaymentModule,
    WebhookModule,
    ScheduleModule.forRoot(), // For retrying failed payments
  ],
})
export class AppModule {}
