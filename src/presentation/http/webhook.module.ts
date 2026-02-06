import { AuthModule } from '@infrastructure/auth/auth.module';
import { KafkaModule } from '@infrastructure/kafka/kafka.module';
import { Module } from '@nestjs/common';
import { WebhookController } from './webhook.controller';
import { WebhookService } from './webhook.service';
import { PaymentUseCaseModule } from '@application/use-cases/payments/payment-use-case.module';
import { RedisModule } from '@infrastructure/redis/redis.module';

@Module({
  imports: [KafkaModule, AuthModule, PaymentUseCaseModule, RedisModule],
  controllers: [WebhookController],
  providers: [WebhookService],
})
export class WebhookModule {}
// export class WebhookModule implements NestModule {
//   configure(consumer: MiddlewareConsumer) {
//     consumer
//       .apply(RawBodyMiddleware)
//       .forRoutes(
//         { path: 'api/webhooks/stripe', method: RequestMethod.POST },
//         { path: 'api/webhooks/razorpay', method: RequestMethod.POST },
//       );
//   }
// }
