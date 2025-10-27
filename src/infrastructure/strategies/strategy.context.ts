import { Injectable } from '@nestjs/common';
import { PaymentStrategy } from '@domain/strategies/payment-strategy.interface';

type CreatePaymentType = PaymentStrategy['createPayment'];
type PaymentArgs = Parameters<CreatePaymentType>;
type PaymentReturn<T> = Promise<T>;

type CreateRefundType = PaymentStrategy['createRefund'];
type RefundArgs = Parameters<CreateRefundType>;
type RefundReturn = ReturnType<CreateRefundType>;

@Injectable()
export class StrategyContext {
  private strategy?: PaymentStrategy;
  constructor() {}

  setStrategy(strategy: PaymentStrategy): void {
    this.strategy = strategy;
  }

  async executePayment<T>(...args: PaymentArgs): Promise<PaymentReturn<T>> {
    if (!this.strategy) {
      throw new Error('No payment strategy set');
    }

    // Forward arguments with correct types
    return this.strategy.createPayment(
      ...(args as PaymentArgs),
    ) as PaymentReturn<T>;
  }

  async executeRefund(...args: RefundArgs): Promise<RefundReturn> {
    if (!this.strategy) {
      throw new Error('No payment strategy set');
    }

    // Forward arguments with correct types
    return this.strategy.createRefund(...(args as RefundArgs)) as RefundReturn;
  }
}
