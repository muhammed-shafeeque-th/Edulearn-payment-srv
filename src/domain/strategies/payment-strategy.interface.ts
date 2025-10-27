import { Money } from '@domain/value-objects/money';

export interface PaymentResult {
  transactionId: string;
  status: PaymentStatus;
  gateway: string;
  metadata?: Record<string, any>;
  errorCode?: string;
  errorMessage?: string;
}

export enum PaymentStatus {
  PENDING = 'PENDING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
  REFUNDED = 'REFUNDED',
  PARTIALLY_REFUNDED = 'PARTIALLY_REFUNDED',
}

export interface PaymentRequest {
  userId: string;
  amount: Money;
  idempotencyKey: string;
  metadata?: Record<string, any>;
  items?: {
    name: string;
    quantity: string;
    unitAmount: { currencyCode: string; value: string };
    imageUrl?: string;
  }[];
  successUrl?: string;
  cancelUrl?: string;
  description?: string;
  customerEmail?: string;
}

export interface RefundRequest {
  transactionId: string;
  amount: Money;
  reason: string;
  metadata?: Record<string, any>;
}

export interface PaymentStrategy {
  readonly gateway: string;

  createPayment<T = any>(request: PaymentRequest): Promise<T>;

  createRefund(request: RefundRequest): Promise<PaymentResult>;

  getPaymentStatus(transactionId: string): Promise<PaymentResult>;

  getSupportedCurrencies(): string[];

  isAvailable(): Promise<boolean>;
}
