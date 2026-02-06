import { Injectable } from '@nestjs/common';
import { ICacheService } from '@application/adaptors/redis.interface';
import { IdempotencyKey } from '@domain/value-objects/idempotency-key';
import { IdempotencyException } from '@domain/exceptions/idempotency.exception';

@Injectable()
export class IdempotencyService {
  private readonly IDEMPOTENCY_LOCK_TTL = 30000; // 30 seconds
  private readonly CACHE_TTL = 86400; // 24h TTL
  constructor(private readonly redis: ICacheService) {}

  async check<T>(
    idempotencyKey: IdempotencyKey,
    callback: () => Promise<T>,
  ): Promise<T> {
    const lockKey = `lock:idempotency:${idempotencyKey.getValue()}`;
    const resultKey = `result:idempotency:${idempotencyKey.getValue()}`;

    // Check if result already exists
    const cachedResult = await this.redis.get(resultKey);
    if (cachedResult) {
      return JSON.parse(cachedResult) as T;
    }

    // Acquire lock
    const lockAcquired = await this.redis.lock(
      lockKey,
      this.IDEMPOTENCY_LOCK_TTL,
    ); // 30s TTL
    if (!lockAcquired) {
      throw new IdempotencyException('Operation already in progress');
    }

    try {
      // Recheck after acquiring lock to handle race conditions
      // const recheckResult = await this.redis.get(resultKey);
      // if (recheckResult) {
      //   return JSON.parse(recheckResult) as T;
      // }

      // Execute the callback
      const result = await callback();

      // Cache the result
      await this.redis.set(resultKey, JSON.stringify(result), this.CACHE_TTL); // 24h TTL

      return result;
    } catch (e) {
      throw e;
    } finally {
      await this.redis.unlock(lockKey);
    }
  }
}
