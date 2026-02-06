import { v4 as uuidv4 } from 'uuid';
import { Money } from '@domain/value-objects/money';
import { IdempotencyKey } from '@domain/value-objects/idempotency-key';
import { BadRequestException } from '@nestjs/common';
import {
  PaymentProviderSession,
  ProviderSessionStatus,
} from './payment-provider-sesssion.entity';
import { PaymentProviderRefund } from './refund-provider.entity';

export enum PaymentStatus {
  PENDING = 'pending',
  SUCCESS = 'success',
  FAILED = 'failed',
  RESOLVED = 'resolved',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired',
}

const ALLOWED_PAYMENT_TRANSITIONS: Record<PaymentStatus, Set<PaymentStatus>> = {
  [PaymentStatus.PENDING]: new Set([
    PaymentStatus.RESOLVED,
    PaymentStatus.CANCELLED,
    PaymentStatus.EXPIRED,
    PaymentStatus.FAILED,
    PaymentStatus.SUCCESS,
  ]),
  [PaymentStatus.RESOLVED]: new Set([
    PaymentStatus.FAILED,
    PaymentStatus.SUCCESS,
  ]),
  [PaymentStatus.SUCCESS]: new Set([]),
  [PaymentStatus.FAILED]: new Set([]),
  [PaymentStatus.CANCELLED]: new Set([]),
  [PaymentStatus.EXPIRED]: new Set([]),
};

export enum PaymentProvider {
  STRIPE = 'stripe',
  PAYPAL = 'paypal',
  RAZORPAY = 'razorpay',
}

export class Payment {
  private _id: string;
  private _userId: string;
  private _orderId: string;
  private _amount: Money;
  private _status: PaymentStatus;
  private _idempotencyKey: IdempotencyKey;
  private _providerOrderId?: string;
  private _createdAt: Date;
  private _providerSessions: PaymentProviderSession[] = [];
  private _expiresAt: Date;
  private _updatedAt: Date;

  private constructor(
    userId: string,
    orderId: string,
    amount: Money,
    idempotencyKey: IdempotencyKey,
    expiresAt: Date,
  ) {
    this._id = uuidv4();
    this._userId = userId;
    this._orderId = orderId;
    this._amount = amount;
    this._status = PaymentStatus.PENDING;
    this._idempotencyKey = idempotencyKey;
    this._expiresAt = expiresAt;
    this._createdAt = new Date();
    this._updatedAt = new Date();

    this.validate();
  }

  static create(
    userId: string,
    orderId: string,
    amount: Money,
    idempotencyKey: IdempotencyKey,
    expiresAt: Date,
  ): Payment {
    if (!userId || !orderId) {
      throw new Error('User ID and Order ID are required');
    }
    return new Payment(userId, orderId, amount, idempotencyKey, expiresAt);
  }

  updateProviderSessionStatus(
    sessionId: string,
    status: ProviderSessionStatus,
  ): void {
    const session = this.getProviderSessionById(sessionId);
    if (!session) throw new Error('Provider session not found');
    session.updateStatus(status);
  }

  getRefundById(refundId: string): PaymentProviderRefund | undefined {
    for (const session of this._providerSessions) {
      const refund = session.refund?.id === refundId;
      if (refund) return session.refund;
    }
    return undefined;
  }

  getCompletedSession(): PaymentProviderSession | null {
    return (
      this._providerSessions.find(
        (s) => s.status === ProviderSessionStatus.CAPTURED,
      ) ?? null
    );
  }

  getProviderSessionById(sessionId: string): PaymentProviderSession | null {
    return this._providerSessions.find((s) => s.id === sessionId) || null;
  }

  getSessionByProviderSessionId(
    providerSessionId: string,
  ): PaymentProviderSession | null {
    return (
      this._providerSessions.find(
        (s) => s.providerOrderId === providerSessionId,
      ) || null
    );
  }

  updateProviderSession(updated: PaymentProviderSession): void {
    const index = this._providerSessions.findIndex((s) => s.id === updated.id);
    if (index === -1) return;
    this._providerSessions[index] = updated;
  }

  public addProviderSession(session: PaymentProviderSession) {
    this._providerSessions.push(session);
  }

  public getProviderSessions(): PaymentProviderSession[] {
    return this._providerSessions;
  }

  private validate(): void {
    if (this._amount.getAmount() <= 0) {
      throw new Error('Amount must be greater than zero');
    }
  }

  private _transitionTo(nextStatus: PaymentStatus) {
    const allowed = ALLOWED_PAYMENT_TRANSITIONS[this._status] || new Set();
    if (!allowed.has(nextStatus)) {
      throw new BadRequestException(
        `Invalid status transition from ${this._status} to ${nextStatus}`,
      );
    }
    this._status = nextStatus;
    this._updatedAt = new Date();
  }

  markResolved(): void {
    this._transitionTo(PaymentStatus.RESOLVED);
  }

  markSucceed(): void {
    this._transitionTo(PaymentStatus.SUCCESS);
    // if (this._status === PaymentStatus.RESOLVED) {
    // } else {
    //   throw new BadRequestException(
    //     'Payment can only succeed from RESOLVED status',
    //   );
    // }
  }

  // Check states whether belongs to: SUCCESS, FAILED, CANCELLED, EXPIRED
  isTerminalState(): boolean {
    return (
      this._status === PaymentStatus.SUCCESS ||
      this._status === PaymentStatus.FAILED ||
      this._status === PaymentStatus.CANCELLED ||
      this._status === PaymentStatus.EXPIRED
    );
  }

  markFailed(): void {
    this._transitionTo(PaymentStatus.FAILED);
    // if (this._status === PaymentStatus.RESOLVED) {
    // } else {
    //   throw new BadRequestException(
    //     'Payment can only fail from RESOLVED status',
    //   );
    // }
  }

  markCancel(providerOrderId: string): void {
    this._transitionTo(PaymentStatus.CANCELLED);
    this._providerOrderId = providerOrderId;
    // if (this._status === PaymentStatus.PENDING) {
    // } else {
    //   throw new BadRequestException(
    //     'Payment can only be cancelled from PENDING status',
    //   );
    // }
  }

  markExpired(): void {
    this._transitionTo(PaymentStatus.EXPIRED);
    // if (this._status === PaymentStatus.PENDING) {
    // } else {
    //   throw new BadRequestException(
    //     'Payment can only expire from PENDING status',
    //   );
    // }
  }

  // Getters (immutable access)
  get id(): string {
    return this._id;
  }
  get userId(): string {
    return this._userId;
  }
  get orderId(): string {
    return this._orderId;
  }
  get expiresAt(): Date {
    return this._expiresAt;
  }

  get amount(): Money {
    return this._amount;
  }
  get status(): PaymentStatus {
    return this._status;
  }
  get idempotencyKey(): IdempotencyKey {
    return this._idempotencyKey;
  }
  get providerOrderId(): string | undefined {
    return this._providerOrderId;
  }
  get createdAt(): Date {
    return this._createdAt;
  }
  get updatedAt(): Date {
    return this._updatedAt;
  }

  setId(id: string): void {
    this._id = id;
  }
  setStatus(status: PaymentStatus): void {
    this._status = status;
  }
  setProviderOrderId(providerOrderId: string): void {
    this._providerOrderId = providerOrderId;
  }
  setCreatedAt(createdAt: Date): void {
    this._createdAt = createdAt;
  }
  setUpdatedAt(updatedAt: Date): void {
    this._updatedAt = updatedAt;
  }
  setExpiresAt(time: Date) {
    this._expiresAt = time;
  }
}
