export class Money {
  private readonly amount: number;
  // private readonly currency: string;
  private currency: string;
  private static readonly VALID_CURRENCIES = ['USD', 'EUR', 'GBP', 'INR'];

  constructor(amount: number, currency: string) {
    this.validate(amount, currency);
    this.amount = amount;
    this.currency = currency.toUpperCase();
  }

  private validate(amount: number, currency: string): void {
    if (amount < 0) {
      throw new Error('Amount cannot be negative');
    }
    if (!Money.VALID_CURRENCIES.includes(currency.toUpperCase())) {
      throw new Error('Currency must be a valid ISO 4217 code');
    }
  }

  getAmount(): number {
    return this.amount;
  }
  getCurrency(): string {
    return this.currency;
  }
  // Don't use.. only for debug purpose
  setCurrency(currency: string): void {
    this.validate(this.amount, currency);
    this.currency = currency;
  }

  equals(other: Money): boolean {
    return this.amount === other.amount && this.currency === other.currency;
  }

  toJSON(): { amount: number; currency: string } {
    return { amount: this.amount, currency: this.currency };
  }
}
