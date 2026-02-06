import { Injectable } from '@nestjs/common';
import { PaymentStrategy } from '@application/adaptors/payment-strategy.interface';

type CreatePaymentType = PaymentStrategy['createPayment'];
type PaymentArgs = Parameters<CreatePaymentType>;
type PaymentReturn = ReturnType<CreatePaymentType>;

type CreateRefundType = PaymentStrategy['refundPayment'];
type RefundArgs = Parameters<CreateRefundType>;
type RefundReturn = ReturnType<CreateRefundType>;

type ResolvePaymentType = PaymentStrategy['resolvePayment'];
type ResolveArgs = Parameters<ResolvePaymentType>;
type ResolveReturn = ReturnType<ResolvePaymentType>;

@Injectable()
export class StrategyContext {
  private strategy?: PaymentStrategy;
  constructor() {}

  setStrategy(strategy: PaymentStrategy): void {
    this.strategy = strategy;
  }

  async createPayment(...args: PaymentArgs): Promise<PaymentReturn> {
    if (!this.strategy) {
      throw new Error('No payment strategy set');
    }

    // Forward arguments with correct types
    return this.strategy.createPayment(
      ...(args as PaymentArgs),
    ) as PaymentReturn;
  }

  async refundPayment(...args: RefundArgs): Promise<RefundReturn> {
    if (!this.strategy) {
      throw new Error('No payment strategy set');
    }

    // Forward arguments with correct types
    return this.strategy.refundPayment(...(args as RefundArgs)) as RefundReturn;
  }

  async resolvePayment(...args: ResolveArgs): Promise<ResolveReturn> {
    if (!this.strategy) {
      throw new Error('No payment strategy set');
    }

    // Forward arguments with correct types
    return this.strategy.resolvePayment(
      ...(args as ResolveArgs),
    ) as ResolveReturn;
  }
  isCurrencySupported(currencyCode: string): boolean {
    if (!this.strategy) {
      throw new Error('No payment strategy set');
    }

    // Forward arguments with correct types
    return this.strategy.isCurrencySupported(currencyCode);
  }
}
