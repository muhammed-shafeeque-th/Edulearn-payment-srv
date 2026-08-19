import { Module } from '@nestjs/common';
import { RedisClientImpl } from './redis.service';
import { EventProcessRepositoryImpl } from './event-process.repository';
import { AppConfigService } from '../config/config.service';
import { ICacheService } from '@application/ports/redis.interface';
import { IEventProcessRepository } from 'src/domain/repositories/event-process-repository.interface';
import { CacheModule } from '@edulearn/nest';

@Module({
  imports: [
    CacheModule.forRootAsync({
      inject: [AppConfigService],

      useFactory: (config: AppConfigService) => ({
        db: config.redisDb,
        keyPrefix: config.redisKeyPrefix,
        maxRetriesPerRequest: 5,
        lazyConnect: true,
        host: config.redisHost,
        port: config.redisPort,
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
