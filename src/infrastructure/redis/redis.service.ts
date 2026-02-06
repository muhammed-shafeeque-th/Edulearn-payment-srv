import { Injectable } from '@nestjs/common';
import { RedisService as NestRedisService } from '@liaoliaots/nestjs-redis';
import { ICacheService } from '@application/adaptors/redis.interface';
import { Redis } from 'ioredis';
import { TracingService } from '@infrastructure/observability/tracing/trace.service';
import { LoggingService } from '@infrastructure/observability/logging/logging.service';

@Injectable()
export class RedisClientImpl implements ICacheService {
  private readonly client: Redis;

  constructor(
    private readonly redisService: NestRedisService,
    private readonly logger: LoggingService,
    private readonly tracer: TracingService,
  ) {
    this.client = this.redisService.getOrThrow();
    this.client.on('error', (error) => {
      this.logger.error(`Redis error: ${error.message}`, {
        error,
        ctx: 'RedisClient',
      });
    });
  }

  async set(key: string, value: string, ttl?: number): Promise<void> {
    return await this.tracer.startActiveSpan(
      'RedisClient.set',
      async (span) => {
        span.setAttribute('cache.key', key);
        try {
          if (ttl) {
            await this.client.set(key, value, 'EX', ttl);
          } else {
            await this.client.set(key, value);
          }
          this.logger.debug(`Set key ${key} in Redis`, { ctx: 'RedisClient' });
        } catch (error: any) {
          this.logger.warn(`Failed to set key ${key}: ${error.message}`, {
            error,
            ctx: 'RedisClient',
          });
          throw error;
        }
      },
    );
  }

  async get(key: string): Promise<string | null> {
    return await this.tracer.startActiveSpan(
      'RedisClient.get',
      async (span) => {
        span.setAttribute('cache.key', key);
        try {
          const value = await this.client.get(key);
          if (value) {
            this.logger.debug(`Cache hit for key ${key} `, {
              ctx: 'RedisClient',
            });
          } else {
            this.logger.debug(`Cache miss for  key ${key}`, {
              ctx: 'RedisClient',
            });
          }
          return value;
        } catch (error: any) {
          this.logger.warn(`Failed to get key ${key}: ${error.message}`, {
            error,
            ctx: 'RedisClient',
          });
          throw error;
        }
      },
    );
  }

  async del(key: string): Promise<void> {
    return await this.tracer.startActiveSpan(
      'RedisClient.del',
      async (span) => {
        span.setAttribute('cache.key', key);
        try {
          await this.client.del(key);
          this.logger.debug(`Deleted key ${key} from Redis`, {
            ctx: 'RedisClient',
          });
        } catch (error: any) {
          this.logger.warn(`Failed to delete key ${key}: ${error.message}`, {
            error,
            ctx: 'RedisClient',
          });
          throw error;
        }
      },
    );
  }

  async exists(key: string): Promise<boolean> {
    return await this.tracer.startActiveSpan(
      'RedisClient.exists',
      async (span) => {
        span.setAttribute('cache.key', key);
        try {
          const exists = (await this.client.exists(key)) === 1;
          this.logger.debug(
            `Key ${key} ${exists ? 'exists' : 'does not exist'} in Redis`,
            {
              ctx: 'RedisClient',
            },
          );
          return exists;
        } catch (error: any) {
          this.logger.warn(`Failed to check key ${key}: ${error.message}`, {
            error,
            ctx: 'RedisClient',
          });
          throw error;
        }
      },
    );
  }

  async lock(key: string, ttl: number): Promise<boolean> {
    return await this.tracer.startActiveSpan(
      'RedisClient.lock',
      async (span) => {
        span.setAttribute('cache.key', key);
        try {
          const result = await this.client.set(key, 'locked', 'PX', ttl, 'NX');
          const acquired = result === 'OK';
          this.logger.debug(
            `Lock ${acquired ? 'acquired' : 'failed'} for key ${key}`,
            { ctx: 'RedisClient' },
          );
          return acquired;
        } catch (error: any) {
          this.logger.warn(
            `Failed to acquire lock for key ${key}: ${error.message}`,
            { error, ctx: 'RedisClient' },
          );
          throw error;
        }
      },
    );
  }

  async unlock(key: string): Promise<void> {
    return await this.tracer.startActiveSpan(
      'RedisClient.unlock',
      async (span) => {
        span.setAttribute('cache.key', key);
        try {
          await this.client.del(key);
          this.logger.debug(`Unlocked key ${key}`, { ctx: 'RedisClient' });
        } catch (error: any) {
          this.logger.warn(`Failed to unlock key ${key}: ${error.message}`, {
            error,
            ctx: 'RedisClient',
          });
          throw error;
        }
      },
    );
  }

  async mget(keys: string[]): Promise<(string | null)[]> {
    return await this.tracer.startActiveSpan(
      'RedisClient.mget',
      async (span) => {
        span.setAttribute('cache.keys', keys);
        try {
          const values = await this.client.mget(...keys);
          this.logger.debug(
            `Batch retrieved keys ${keys.join(', ')} from Redis`,
            {
              ctx: 'RedisClient',
            },
          );
          return values;
        } catch (error: any) {
          this.logger.warn(`Failed to batch get keys: ${error.message}`, {
            error,
            ctx: 'RedisClient',
          });
          throw error;
        }
      },
    );
  }

  async delByPattern(pattern: string): Promise<void> {
    return await this.tracer.startActiveSpan(
      'RedisClient.delByPattern',
      async (span) => {
        span.setAttribute('cache.pattern', pattern);

        try {
          const stream = this.client.scanStream({
            match: pattern,
            count: 100, // adjust batch size depending on key volume
          });

          let deletedCount = 0;
          const pipeline = this.client.pipeline();

          for await (const keys of stream) {
            if (keys.length) {
              // Batch delete keys using pipeline
              keys.forEach((key: string) => pipeline.del(key));
              const results = await pipeline.exec();
              deletedCount += Array.isArray(results) ? results.length : 0;
            }
          }

          this.logger.debug(
            `Deleted ${deletedCount} keys matching pattern "${pattern}"`,
            { ctx: 'RedisClient' },
          );
        } catch (error: any) {
          this.logger.warn(
            `Failed to delete keys by pattern "${pattern}": ${error.message}`,
            { error, ctx: 'RedisClient' },
          );
          throw error;
        } finally {
          span.end();
        }
      },
    );
  }

  /**
   * Set an expiration in seconds to a key.
   */
  async expire(key: string, ttl: number): Promise<boolean> {
    return await this.tracer.startActiveSpan(
      'RedisClient.expire',
      async (span) => {
        span.setAttribute('cache.key', key);
        span.setAttribute('cache.ttl', ttl);
        try {
          const result = await this.client.expire(key, ttl);
          const success = result === 1;
          this.logger.debug(`Set expire (${ttl}s) on key ${key}: ${success}`, {
            ctx: 'RedisClient',
          });
          return success;
        } catch (error: any) {
          this.logger.warn(
            `Failed to set expire on key ${key}: ${error.message}`,
            { error, ctx: 'RedisClient' },
          );
          throw error;
        }
      },
    );
  }

  /**
   * Get the TTL for a key (in seconds).
   */
  async getTTL(key: string): Promise<number> {
    return await this.tracer.startActiveSpan(
      'RedisClient.getTTL',
      async (span) => {
        span.setAttribute('cache.key', key);
        try {
          const ttl = await this.client.ttl(key);
          this.logger.debug(`TTL for key ${key} is ${ttl} seconds`, {
            ctx: 'RedisClient',
          });
          return ttl;
        } catch (error: any) {
          this.logger.warn(
            `Failed to get TTL for key ${key}: ${error.message}`,
            { error, ctx: 'RedisClient' },
          );
          throw error;
        }
      },
    );
  }
}
