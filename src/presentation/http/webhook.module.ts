import { AuthModule } from '@infrastructure/auth/auth.module';
import { KafkaModule } from '@infrastructure/kafka/kafka.module';
import { Module } from '@nestjs/common';
import { WebhookController } from './webhook.controller';
import { WebhookService } from './webhook.service';

@Module({
  imports: [KafkaModule, AuthModule],
  controllers: [WebhookController],
  providers: [WebhookService],
})
export class WebhookModule {}
