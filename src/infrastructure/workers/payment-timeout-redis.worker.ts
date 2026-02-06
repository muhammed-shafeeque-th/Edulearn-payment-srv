import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
// import { RedisService as NestRedisService } from '@liaoliaots/nestjs-redis';
import { Redis } from 'ioredis';
import { LoggingService } from '@infrastructure/observability/logging/logging.service';
import { HandlePaymentTimeoutUseCase } from '@application/use-cases/payments/handle-payment-timeout.use-case';
import { AppConfigService } from '@infrastructure/config/config.service';

@Injectable()
export class PaymentTimeoutRedisWorker
  implements OnModuleInit, OnModuleDestroy {
  private subscriber: Redis | null = null;
  private readonly redisExpiredPattern = '__keyevent@*__:expired';
  private readonly timeoutKeyPrefix = 'payments:timeout';

  constructor(
    // private readonly redisService: NestRedisService,
    private readonly logger: LoggingService,
    private readonly handlePaymentTimeoutUseCase: HandlePaymentTimeoutUseCase,
    private readonly configService: AppConfigService,
  ) { }

  async onModuleInit(): Promise<void> {
    // const client = this.redisService.getOrThrow();

    // Use connection string directly since ioredis constructor options do not support 'url' property.
    this.subscriber = new Redis(this.configService.redisUrl, {
      keyPrefix: this.configService.redisKeyPrefix ?? undefined,
      maxRetriesPerRequest: null,
      retryStrategy: (times) => Math.min(times * 200, 2000),
    });

    this.subscriber.on('ready', () => {
      this.logger.debug('PaymentTimeoutRedisWorker subscriber ready');
    });

    this.subscriber.on('error', (error) => {
      this.logger.error(`Redis subscriber error: ${error.message}`, { error });
    });

    this.subscriber.on('pmessage', async (_, __, key) => {
      await this.handleExpiredKey(key);
    });


    await this.subscriber.psubscribe(this.redisExpiredPattern);
    this.logger.debug(
      `Payment timeout worker subscribed to Redis pattern ${this.redisExpiredPattern}`,
      { ctx: 'PaymentTimeoutRedisWorker' },
    );
  }

  async onModuleDestroy(): Promise<void> {
    if (this.subscriber) {
      await this.subscriber.quit();
      this.subscriber = null;
    }
  }

  private stripKeyPrefix(fullKey: string): string {
    const prefix = this.configService.redisKeyPrefix ?? '';
    if (prefix && fullKey.startsWith(prefix)) {
      return fullKey.slice(prefix.length);
    }
    return fullKey;
  }

  private async handleExpiredKey(fullKey: string): Promise<void> {
    if (!fullKey) {
      return;
    }

    const normalizedKey = this.stripKeyPrefix(fullKey);
    if (!normalizedKey.startsWith(`${this.timeoutKeyPrefix}:`)) {
      return;
    }

    const segments = normalizedKey.split(':');
    const paymentId = segments[segments.length - 1];

    if (!paymentId) {
      this.logger.warn(
        `Unable to extract paymentId from expired key ${fullKey}`,
        { ctx: 'PaymentTimeoutRedisWorker' },
      );
      return;
    }

    try {
      await this.handlePaymentTimeoutUseCase.execute({ paymentId });
    } catch (error: any) {
      this.logger.error(
        `Failed to process payment timeout for ${paymentId}: ${error?.message}`,
        { error, ctx: 'PaymentTimeoutRedisWorker' },
      );
    }
  }
}
