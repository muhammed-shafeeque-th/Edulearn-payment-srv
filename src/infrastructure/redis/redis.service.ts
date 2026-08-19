import { Injectable } from '@nestjs/common';
import { ITraceService } from '@application/ports/trace.service';
import { CacheService } from '@edulearn/nest';
import { ICacheService } from '@application/ports/redis.interface';
import { ILoggerService } from '@application/ports/logger.service';

@Injectable()
export class RedisClientImpl implements ICacheService {
  constructor(
    private readonly _cache: CacheService,
    private readonly _logger: ILoggerService,
    private readonly _tracer: ITraceService,
  ) {}

  async set<T>(key: string, value: T, ttl = 3600): Promise<void> {
    return this._cache.set(key, value, ttl);
  }

  async get<T>(key: string): Promise<T | null> {
    return this._cache.get(key);
  }

  async ping(): Promise<void> {
    this._cache.ping();
  }

  async del(key: string): Promise<void> {
    return this._cache.delete(key);
  }

  async exists(key: string): Promise<boolean> {
    return this._cache.exists(key);
  }

  async lock(key: string, ttl: number): Promise<boolean> {
    return await this._tracer.startActiveSpan(
      'RedisClient.lock',
      async (span) => {
        span.setAttribute('cache.key', key);
        try {
          const result = await this._cache
            .getClient()
            .set(key, 'locked', 'PX', ttl, 'NX');
          const acquired = result === 'OK';
          this._logger.debug(
            `Lock ${acquired ? 'acquired' : 'failed'} for key ${key}`,
            { ctx: 'RedisClient' },
          );
          return acquired;
        } catch (error: any) {
          this._logger.warn(
            `Failed to acquire lock for key ${key}: ${error.message}`,
            { error, ctx: 'RedisClient' },
          );
          throw error;
        }
      },
    );
  }

  async unlock(key: string): Promise<void> {
    return await this._tracer.startActiveSpan(
      'RedisClient.unlock',
      async (span) => {
        span.setAttribute('cache.key', key);
        try {
          await this._cache.getClient().del(key);
          this._logger.debug(`Unlocked key ${key}`, { ctx: 'RedisClient' });
        } catch (error: any) {
          this._logger.warn(`Failed to unlock key ${key}: ${error.message}`, {
            error,
            ctx: 'RedisClient',
          });
          throw error;
        }
      },
    );
  }

  async mget<T>(keys: string[]): Promise<(T | null)[]> {
    return this._cache.getMultiple(keys);
  }

  async delByPattern(pattern: string): Promise<void> {
    return await this._tracer.startActiveSpan(
      'RedisClient.delByPattern',
      async (span) => {
        span.setAttribute('cache.pattern', pattern);

        try {
          const stream = this._cache.getClient().scanStream({
            match: pattern,
            count: 100, // adjust batch size depending on key volume
          });

          let deletedCount = 0;
          const pipeline = this._cache.getClient().pipeline();

          for await (const keys of stream) {
            if (Array.isArray(keys) && keys.length) {
              keys.forEach((key: string) => pipeline.del(key));
              const results = await pipeline.exec();
              deletedCount += Array.isArray(results) ? results.length : 0;
            }
          }

          this._logger.debug(
            `Deleted ${deletedCount} keys matching pattern "${pattern}"`,
            { ctx: 'RedisClient' },
          );
        } catch (error: any) {
          this._logger.warn(
            `Failed to delete keys by pattern "${pattern}": ${error.message}`,
            { error, ctx: 'RedisClient' },
          );
          throw error;
        }
      },
    );
  }

  /**
   * Set an expiration in seconds to a key.
   */
  async expire(key: string, ttl: number): Promise<boolean> {
    return await this._tracer.startActiveSpan(
      'RedisClient.expire',
      async (span) => {
        span.setAttribute('cache.key', key);
        span.setAttribute('cache.ttl', ttl);
        try {
          const result = await this._cache.getClient().expire(key, ttl);
          const success = result === 1;
          this._logger.debug(`Set expire (${ttl}s) on key ${key}: ${success}`, {
            ctx: 'RedisClient',
          });
          return success;
        } catch (error: any) {
          this._logger.warn(
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
    return await this._tracer.startActiveSpan(
      'RedisClient.getTTL',
      async (span) => {
        span.setAttribute('cache.key', key);
        try {
          const ttl = await this._cache.ttl(key);
          this._logger.debug(`TTL for key ${key} is ${ttl} seconds`, {
            ctx: 'RedisClient',
          });
          return ttl;
        } catch (error: any) {
          this._logger.warn(
            `Failed to get TTL for key ${key}: ${error.message}`,
            { error, ctx: 'RedisClient' },
          );
          throw error;
        }
      },
    );
  }
}
