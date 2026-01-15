import { PaymentProvider } from '@domain/entities/payments';
import { Money } from '@domain/value-objects/money';

/**
 * Represents the standard result for payment-related operations.
 */
export interface PaymentResult {
  transactionId: string;
  status: PaymentStatus;
  gateway: string;
  metadata?: Record<string, any>;
  errorCode?: string;
  errorMessage?: string;
}

export interface RefundResult {
  refundId: string; // provider refund id
  status: 'success' | 'pending' | 'failed';
  amount: number;
  currency: string;
  metadata?: any;
}

/**
 * Represents the result for payment-fail  operations.
 */
export interface PaymentFailureResult {
  transactionId: string;
  status: PaymentStatus;
  success: boolean;
}

/**
 * Enum for standardized payment statuses.
 */
export enum PaymentStatus {
  PENDING = 'PENDING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
  REFUNDED = 'REFUNDED',
  PARTIALLY_REFUNDED = 'PARTIALLY_REFUNDED',
}

/**
 * The base structure for a new payment initiation request.
 */
export interface PaymentRequest {
  userId: string;
  amount: Money;
  idempotencyKey: string;
  orderId?: string;
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

/**
 * Request structure for processing a refund.
 */
export interface RefundRequest {
  providerPaymentId: string;
  amount: number;
  currency: string;
  idempotencyKey?: string;
  reason?: string;
}

/**
 * Stripe-specific verification request details.
 */
export interface StripeResolveRequest {
  sessionId: string;
}

/**
 * Razorpay-specific verification request details.
 */
export interface RazorpayResolveRequest {
  orderId: string;
  paymentId: string;
  signature: string;
}

/**
 * Paypal-specific verification request details.
 */
export interface PaypalResolveRequest {
  providerOrderId: string;
  idempotencyKey: string;
}

/**
 * Generic structure for Resolveing payment response.
 */
export interface ResolvePaymentResponse {
  providerStatus: string;
  isVerified: boolean;
}

/**
 * Session information returned when initiating a Stripe payment.
 */
export interface StripeSession {
  providerOrderId: string;
  provider: PaymentProvider;
  providerAmount: number;
  providerCurrency: string;
  metadata: object;
  sessionId: string;
  publicKey: string;
  sessionStatus: PaymentStatus;
  clientSecret: string;
  url: string;
}

/**
 * Session information returned when initiating a Razorpay payment.
 */
export interface RazorpaySession {
  providerOrderId: string;
  providerAmount: number;
  providerCurrency: string;
  provider: PaymentProvider;
  metadata: object;
  orderId: string;
  orderStatus: string;
  keyId: string;
  amount: number;
  currency: string;
}

/**
 * Session information returned when initiating a Paypal payment.
 */
export interface PaypalSession {
  providerOrderId: string;
  providerAmount: number;
  provider: PaymentProvider;
  providerCurrency: string;
  metadata: object;
  orderId: string;
  orderStatus: string;
  approvalLink: string;
}

/**
 * Generic structure for payment verification request, supporting multiple providers.
 */
export type ResolvePaymentRequest =
  | StripeResolveRequest
  | RazorpayResolveRequest
  | PaypalResolveRequest;

/**
 * The result of initiating a payment session for any provider.
 */
export type PaymentSessionResult =
  | StripeSession
  | RazorpaySession
  | PaypalSession;

/**
 * Interface for all payment gateway strategies, enforcing consistency and robustness.
 */
export interface PaymentStrategy {
  readonly gateway: string;

  /**
   * Creates a new payment session.
   * @param request Payment details.
   * @returns Payment session details for the underlying gateway.
   */
  createPayment(request: PaymentRequest): Promise<PaymentSessionResult>;

  /**
   * Processes a refund against a given transaction.
   * @param request Refund details.
   * @returns Result of the refund operation.
   */
  refundPayment(request: RefundRequest): Promise<RefundResult>;

  /**
   * Retrieves the standardized status and detail of a transaction by its ID.
   * @param transactionId The provider's transaction identifier.
   * @returns Payment result with unified metadata and status.
   */
  getPaymentStatus(transactionId: string): Promise<PaymentResult>;

  /**
   * Verifies the authenticity and completion of a payment.
   * @param request Aggregated verification payload for the provider.
   * @returns Verification status and provider-specific state.
   */
  resolvePayment(
    request: ResolvePaymentRequest,
  ): Promise<ResolvePaymentResponse>;

  /**
   * Returns all supported currency codes for this gateway strategy.
   */
  getSupportedCurrencies(): string[];

  /**
   * Checks if the payment gateway is operational and available.
   * @returns Boolean indicating readiness of the payment provider.
   */
  isAvailable(): Promise<boolean>;

  /**
   * Checks if the specified currency is supported by the payment provider.
   * @param currencyCode The ISO currency code to check (e.g. "USD", "INR").
   * @returns Boolean indicating whether the currency is supported.
   */
  isCurrencySupported(currencyCode: string): boolean;

  /**
   * Explicitly fails or cancels a payment (if allowed/supported by the gateway).
   * Useful for business-initiated cancellations, reversals, or failed state transitions.
   * Must handle idempotency and report failure reason if provided.
   * @param transactionId The gateway-specific transaction (or session/order) id.
   * @param reason Optional field to describe why the payment is being failed/cancelled.
   * @returns A Promise that resolves to a {@link PaymentFailureResult},
   *          which contains the resulting payment state and details after the fail or cancel operation.
   */
  cancelPayment(
    transactionId: string,
    reason?: string,
  ): Promise<PaymentFailureResult>;
}
