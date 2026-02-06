/* eslint-disable @typescript-eslint/no-empty-object-type */
import { BaseEvent } from './base-event';

export interface OrderPaymentSuccessEvent
  extends BaseEvent<{
    paymentId: string;
    orderId: string;
    provider: string;
    userId: string;
    providerOrderId: string | undefined;
    paymentStatus: string;
  }> {}

export interface OrderPaymentTimeoutEvent
  extends BaseEvent<{
    paymentId: string;
    orderId: string;
    provider: string | undefined;
    userId: string;
    providerOrderId: string | undefined;
    paymentStatus: string;
  }> {}
export interface OrderPaymentFailedEvent
  extends BaseEvent<{
    paymentId: string;
    orderId: string;
    provider: string;
    userId: string;
    providerOrderId: string | undefined;
    paymentStatus: string;
  }> {}
export interface OrderPaymentInitiateEvent
  extends BaseEvent<{
    paymentId: string;
    userId: string;
    orderId: string;
    provider: string;
    providerOrderId: string | undefined;
    paymentStatus: string;
  }> {}
