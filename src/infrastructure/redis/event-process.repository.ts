import { Injectable } from '@nestjs/common';
import { ICacheService } from '@application/ports/redis.interface';
import { IEventProcessRepository } from '@domain/repositories/event-process-repository.interface';
import { ILoggerService } from '@application/ports/logger.service';
import { ITraceService } from '@application/ports/trace.service';

@Injectable()
export class EventProcessRepositoryImpl implements IEventProcessRepository {
  private readonly KEY_PREFIX = 'event:processed:';

  constructor(
    private readonly redisService: ICacheService,
    private readonly _logger: ILoggerService,
    private readonly _tracer: ITraceService,
  ) {}

  async isProcessed(eventId: string): Promise<boolean> {
    return this._tracer.startActiveSpan(
      'EventProcessRepositoryImpl.isProcessed',
      async (span) => {
        const key = this.KEY_PREFIX + eventId;
        span.setAttribute('event.id', eventId);
        try {
          const result = await this.redisService.get(key);
          const processed = result === '1';
          this._logger.debug(
            `Checked processed status for eventId ${eventId}: ${processed}`,
            {
              ctx: 'EventProcessRepositoryImpl',
            },
          );
          return processed;
        } catch (error: any) {
          this._logger.error(
            `Failed to check processed status for eventId ${eventId}: ${error.message}`,
            {
              error,
              ctx: 'EventProcessRepositoryImpl',
            },
          );
          throw error;
        }
      },
    );
  }

  async markAsProcessed(eventId: string): Promise<boolean> {
    return this._tracer.startActiveSpan(
      'EventProcessRepositoryImpl.markAsProcessed',
      async (span) => {
        const key = this.KEY_PREFIX + eventId;
        span.setAttribute('event.id', eventId);
        try {
          // Set with NX, i.e., only if not already set (atomic)
          // Optionally, one can choose an expiry in seconds for the deduplication window, e.g., 30 days
          const expirySeconds = 60 * 60 * 24 * 30; // 30 days
          // Otherwise, use the underlying redis client; assuming basic set nx is exposed in redisService
          // redisService.set(key, value, ttl?)
          await this.redisService.set(key, '1', expirySeconds);

          this._logger.debug(
            `Marked eventId ${eventId} as processed in Redis`,
            {
              ctx: 'EventProcessRepositoryImpl',
            },
          );
          return true;
        } catch (error: any) {
          this._logger.error(
            `Failed to mark eventId ${eventId} as processed: ${error.message}`,
            {
              error,
              ctx: 'EventProcessRepositoryImpl',
            },
          );
          throw error;
        }
      },
    );
  }
}
