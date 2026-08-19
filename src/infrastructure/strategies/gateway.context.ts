import { Injectable } from '@nestjs/common';
import { PaymentGateway } from '@application/ports/payment-gateway-strategy.interface';

type CreatePaymentType = PaymentGateway['createPayment'];
type PaymentArgs = Parameters<CreatePaymentType>;
type PaymentReturn = ReturnType<CreatePaymentType>;

type CreateRefundType = PaymentGateway['refundPayment'];
type RefundArgs = Parameters<CreateRefundType>;
type RefundReturn = ReturnType<CreateRefundType>;

type ResolvePaymentType = PaymentGateway['resolvePayment'];
type ResolveArgs = Parameters<ResolvePaymentType>;
type ResolveReturn = ReturnType<ResolvePaymentType>;

@Injectable()
export class GatewayContext {
  private strategy?: PaymentGateway;
  constructor() {}

  setGateway(strategy: PaymentGateway): void {
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
