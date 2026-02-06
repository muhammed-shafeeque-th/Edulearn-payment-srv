import { PaymentProvider } from '@domain/entities/payments';

export type PaymentProviderEvent = {
  provider: PaymentProvider;

  /** Unique event id from provider (Stripe evt_..., PayPal WH-...) */
  providerEventId: string;

  /** Raw provider event type */
  providerEventType: string;

  /** Provider payment identifier */
  providerPaymentId?: string;

  /** Your internal order id */
  orderId?: string;

  /** When provider emitted the event */
  occurredAt: Date;

  /** Raw payload for audit/debug */
  raw: unknown;
};
