import { Injectable } from '@nestjs/common';
import { LoggingService } from '@infrastructure/observability/logging/logging.service';
import { ICacheService } from '@application/adaptors/redis.interface';
import {
  ExchangeRateResponse,
  IExchangeRateService,
} from '@application/adaptors/exchange-rate.service';

type Currency = string;
type FrankfurterExchangeResponse = {
  amount: number;
  rate: Currency;
  date: Date;
  rates: {
    [currency: Currency]: number;
  };
};

@Injectable()
export class FrankfurterExchangeRateService implements IExchangeRateService {
  private readonly ttlSeconds = 60; // short TTL for near real-time
  private readonly apiBase = 'https://api.frankfurter.app';

  constructor(
    private readonly redis: ICacheService,
    private readonly logger: LoggingService,
  ) {}

  async getRate(base: string, target: string): Promise<ExchangeRateResponse> {
    base = base.toUpperCase();
    target = target.toUpperCase();

    if (base === target)
      return {
        rate: 1,
        timestampDate: new Date(),
      };

    const redisKey = `fx:${base}:${target}`;

    // -------------------------------------------------------------
    // 1) CHECK REDIS (cache-first for performance)
    // -------------------------------------------------------------
    const cached = await this.redis.get(redisKey);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (parsed?.rate) {
          return parsed.rate;
        }
      } catch {}
    }

    // -------------------------------------------------------------
    // 2) FETCH FROM PROVIDER (Frankfurter)
    // -------------------------------------------------------------
    const rate = await this.fetchRate(base, target);

    // -------------------------------------------------------------
    // 3) WRITE TO REDIS WITH TTL
    // -------------------------------------------------------------
    try {
      await this.redis.set(
        redisKey,
        JSON.stringify({ rate, ts: Date.now() }),
        this.ttlSeconds,
      );
    } catch (err) {
      this.logger.warn('Failed writing FX rate to Redis', {
        base,
        target,
        error: (err as Error).message,
      });
    }

    return rate;
  }

  private async fetchRate(
    base: string,
    target: string,
  ): Promise<ExchangeRateResponse> {
    const url = `${this.apiBase}/latest?from=${base}&to=${target}`;

    let response;
    try {
      // Use AbortController to specify a timeout for fetch
      const controller = new AbortController();
      const timeout = 15000; // 7 seconds timeout (customize as needed)
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      try {
        response = await fetch(url, { signal: controller.signal });
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (err) {
      return this.useStaleFallback(base, target, err);
    }

    if (!response.ok) {
      return this.useStaleFallback(
        base,
        target,
        new Error(`Provider returned ${response.status}`),
      );
    }

    const data: FrankfurterExchangeResponse = await response.json();
    console.log(
      'Response from Exchange provider : ' + JSON.stringify(data, null, 2),
    );
    const rate = data?.rates?.[target];

    if (!rate || isNaN(rate)) {
      throw new Error(
        `Invalid response from provider: ${JSON.stringify(data)}`,
      );
    }

    return {
      rate,
      timestampDate: data.date ? new Date(data.date) : new Date(),
    };
  }

  /**
   * Uses stale Redis value if the provider failed.
   * This is critical for payment reliability.
   */
  private async useStaleFallback(
    base: string,
    target: string,
    error: any,
  ): Promise<ExchangeRateResponse> {
    this.logger.error('FX provider fetch failed', {
      base,
      target,
      error: error?.message,
    });

    const staleKey = `fx:${base}:${target}`;
    const cached = await this.redis.get(staleKey);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (parsed?.rate) {
          this.logger.warn('Using stale FX rate due to provider failure');
          return parsed.rate;
        }
      } catch {}
    }

    throw new Error('FX conversion failed and no cached rate available');
  }
}
