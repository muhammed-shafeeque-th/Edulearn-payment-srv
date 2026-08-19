export type ExchangeRateResponse = {
  rate: number;
  timestampDate: Date;
};

export abstract class IExchangeRateService {
  /**
   * Returns the exchange rate from base → target
   * Example: getRate('INR', 'USD') → 0.0123
   */
  abstract getRate(base: string, target: string): Promise<ExchangeRateResponse>;
}
