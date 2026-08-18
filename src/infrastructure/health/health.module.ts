import { Module } from '@nestjs/common';
import { DBHealthCheck } from './checks/db.check';
import { RedisHealthCheck } from './checks/redis.check';
import { KafkaHealthCheck } from './checks/kafka.check';
import { HealthModule } from '@edulearn/nest';
import { RedisModule } from '../redis/redis.module';
import { AppConfigService } from '../config/config.service';
import { KafkaModule } from '../kafka/kafka.module';
import { DatabaseEntityModule } from '../database/database-entity.module';

@Module({
  imports: [
    RedisModule,
    KafkaModule,
    DatabaseEntityModule,
    HealthModule.forRootAsync({
      useFactory: (config: AppConfigService) => ({
        serviceName: config.serviceName,
      }),
      inject: [AppConfigService],
      imports: [RedisModule, KafkaModule, DatabaseEntityModule],
    }),
  ],
  providers: [RedisHealthCheck, DBHealthCheck, KafkaHealthCheck],
})
export class AppHealthModule {}
