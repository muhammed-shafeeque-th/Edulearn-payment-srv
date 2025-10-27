import { v4 as uuidv4 } from 'uuid';
import { Money } from '@domain/value-objects/money';
import { IdempotencyKey } from '@domain/value-objects/idempotency-key';

export enum RefundStatus {
  PENDING = 'PENDING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
}

export class Refund {
  private id: string;
  private paymentId: string;
  private userId: string;
  private amount: Money;
  private status: RefundStatus;
  private idempotencyKey: IdempotencyKey;
  private reason: string;
  private transactionId?: string;
  private createdAt: Date;
  private updatedAt: Date;

  private constructor(
    paymentId: string,
    userId: string,
    amount: Money,
    idempotencyKey: IdempotencyKey,
    reason: string,
  ) {
    this.id = uuidv4();
    this.paymentId = paymentId;
    this.userId = userId;
    this.amount = amount;
    this.status = RefundStatus.PENDING;
    this.idempotencyKey = idempotencyKey;
    this.reason = reason;
    this.createdAt = new Date();
    this.updatedAt = new Date();

    this.validate();
  }

  static create(
    paymentId: string,
    userId: string,
    amount: Money,
    idempotencyKey: IdempotencyKey,
    reason: string,
  ): Refund {
    if (!paymentId || !userId) {
      throw new Error('Payment ID and User ID are required');
    }
    if (!reason) {
      throw new Error('Refund reason is required');
    }
    return new Refund(paymentId, userId, amount, idempotencyKey, reason);
  }

  private validate(): void {
    if (this.amount.getAmount() <= 0) {
      throw new Error('Refund amount must be greater than zero');
    }
  }

  succeed(transactionId: string): void {
    if (this.status !== RefundStatus.PENDING) {
      throw new Error('Refund can only succeed from PENDING status');
    }
    this.status = RefundStatus.SUCCESS;
    this.transactionId = transactionId;
    this.updatedAt = new Date();
  }

  fail(): void {
    if (this.status !== RefundStatus.PENDING) {
      throw new Error('Refund can only fail from PENDING status');
    }
    this.status = RefundStatus.FAILED;
    this.updatedAt = new Date();
  }

  // Getters
  getId(): string {
    return this.id;
  }
  getPaymentId(): string {
    return this.paymentId;
  }
  getUserId(): string {
    return this.userId;
  }
  getAmount(): Money {
    return this.amount;
  }
  getStatus(): RefundStatus {
    return this.status;
  }
  getIdempotencyKey(): IdempotencyKey {
    return this.idempotencyKey;
  }
  getReason(): string {
    return this.reason;
  }
  getTransactionId(): string | undefined {
    return this.transactionId;
  }
  getCreatedAt(): Date {
    return this.createdAt;
  }
  getUpdatedAt(): Date {
    return this.updatedAt;
  }

  // Setters for persistence layer
  setId(id: string): void {
    this.id = id;
  }
  setStatus(status: RefundStatus): void {
    this.status = status;
  }
  setTransactionId(transactionId: string): void {
    this.transactionId = transactionId;
  }
  setCreatedAt(createdAt: Date): void {
    this.createdAt = createdAt;
  }
  setUpdatedAt(updatedAt: Date): void {
    this.updatedAt = updatedAt;
  }
}
