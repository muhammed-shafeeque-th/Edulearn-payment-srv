export enum ProviderRefundStatus {
  PENDING = 'pending',
  SUCCESS = 'success',
  FAILED = 'failed',
}

export class PaymentProviderRefund {
  private _id: string;
  private _paymentId: string;
  private _providerSessionId: string;
  private _idempotencyKey: string;

  private _requestedAmount: number;
  private _requestedCurrency: string;

  private _providerRefundId?: string;
  private _providerFee?: number;
  private _metadata?: any;

  private _status: ProviderRefundStatus;
  private _createdAt: Date;
  private _updatedAt: Date;

  constructor(params: {
    id: string;
    paymentId: string;
    providerSessionId: string;
    requestedCurrency: string;
    requestedAmount: number;
    idempotencyKey: string;
    status?: ProviderRefundStatus;
    providerRefundId?: string;
    metadata?: any;
  }) {
    this._id = params.id;
    this._paymentId = params.paymentId;
    this._providerSessionId = params.providerSessionId;
    this._requestedAmount = Number(params.requestedAmount);
    this._requestedCurrency = params.requestedCurrency;
    this._idempotencyKey = params.idempotencyKey;

    this._status = params.status ?? ProviderRefundStatus.PENDING;
    this._metadata = params.metadata ?? {};
    this._createdAt = new Date();
    this._updatedAt = new Date();

    this.validate();
  }

  private validate() {
    if (this._requestedAmount <= 0)
      throw new Error('Requested refund amount must be > 0');

    if (!this._paymentId) throw new Error('Refund must belong to a payment');

    if (!this._providerSessionId)
      throw new Error('Refund must belong to a provider session');
  }

  markAsSuccess(providerRefundId: string, metadata?: any) {
    this._status = ProviderRefundStatus.SUCCESS;
    this._providerRefundId = providerRefundId;
    this._metadata = { ...(this._metadata || {}), ...metadata };
    this._updatedAt = new Date();
  }

  markAsFailed(reason?: any) {
    this._status = ProviderRefundStatus.FAILED;
    this._metadata = { ...(this._metadata || {}), failureReason: reason };
    this._updatedAt = new Date();
  }

  get idempotencyKey(): string {
    return this._idempotencyKey;
  }
  get id(): string {
    return this._id;
  }
  get paymentId(): string {
    return this._paymentId;
  }
  get providerSessionId(): string {
    return this._providerSessionId;
  }
  get requestedAmount(): number {
    return this._requestedAmount;
  }
  get requestedCurrency(): string {
    return this._requestedCurrency;
  }
  get providerRefundId(): string | undefined {
    return this._providerRefundId;
  }
  get providerFee(): number | undefined {
    return this._providerFee;
  }
  get metadata(): any {
    return this._metadata;
  }
  get status(): ProviderRefundStatus {
    return this._status;
  }
  get createdAt(): Date {
    return this._createdAt;
  }
  get updatedAt(): Date {
    return this._updatedAt;
  }

  setCreatedAt(date: Date) {
    this._createdAt = date;
  }

  setUpdatedAt(date: Date) {
    this._updatedAt = date;
  }

  setProviderFee(fee: number) {
    this._providerFee = fee;
  }
}
