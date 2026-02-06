import { AppConfigService } from '@infrastructure/config/config.service';
import { Module } from '@nestjs/common';
import { RedisModule as NestRedisModule } from '@liaoliaots/nestjs-redis';
import { RedisClientImpl } from './redis.service';
import { ICacheService } from '@application/adaptors/redis.interface';
import { IEventProcessRepository } from '@domain/repositories/event-process-repository.interface';
import { EventProcessRepositoryImpl } from './event-process.repository';

@Module({
  imports: [
    NestRedisModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (...args: unknown[]) => ({
        config: [
          {
            name: 'default',
            url: (args[0] as AppConfigService).redisUrl,
            maxRetriesPerRequest: 3,
            enableReadyCheck: true,
            reconnectOnError: () => true,
            enableAutoPipelining: true,
            keyPrefix: (args[0] as AppConfigService).redisKeyPrefix,
            connectTimeout: 5000,
            keepAlive: 1000,
            maxLoadingRetryTime: 10000,
            retryStrategy: (times: number) => Math.min(times * 200, 2000),
            poolOptions: {
              min: (args[0] as AppConfigService).redisMinConnections,
              max: (args[0] as AppConfigService).redisMaxConnections,
            },
          },
          {
            name: 'subscriber',
            url: (args[0] as AppConfigService).redisUrl,
            connectTimeout: 5000,
          },
        ],
      }),
    }),
  ],
  providers: [
    { provide: ICacheService, useClass: RedisClientImpl },
    { provide: IEventProcessRepository, useClass: EventProcessRepositoryImpl },
  ],
  exports: [ICacheService, IEventProcessRepository],
})
export class RedisModule {}
