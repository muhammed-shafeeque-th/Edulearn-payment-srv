import { Module } from '@nestjs/common';
import { FrankfurterExchangeRateService } from './exchange.service';
import { IExchangeRateService } from '@application/adaptors/exchange-rate.service';
import { RedisModule } from '@infrastructure/redis/redis.module';

@Module({
  imports: [RedisModule],
  providers: [
    {
      provide: IExchangeRateService,
      useClass: FrankfurterExchangeRateService,
    },
  ],
  exports: [IExchangeRateService],
})
export class ExchangeModule {}
