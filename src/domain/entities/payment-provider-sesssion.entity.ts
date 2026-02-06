import { PaymentProvider } from './payments';
import { PaymentProviderRefund } from './refund-provider.entity';

export enum ProviderSessionStatus {
  CREATED = 'created',
  PENDING_APPROVAL = 'pending_approval',
  APPROVED = 'approved',
  CAPTURED = 'captured',
  FAILED = 'failed',
}

export class PaymentProviderSession {
  private _id: string;
  private _paymentId: string;

  private _provider: PaymentProvider;
  private _providerOrderId?: string;
  private _providerPaymentId?: string;
  private _refund?: PaymentProviderRefund;

  private _providerAmount: number;
  private _providerCurrency: string;

  private _fxRate: number;
  private _fxTimestamp: Date;

  private _status: ProviderSessionStatus;
  private _metadata?: any;

  private _createdAt: Date;
  private _updatedAt: Date;

  constructor(params: {
    id: string;
    paymentId: string;
    provider: PaymentProvider;
    providerOrderId?: string;
    providerPaymentId?: string;
    providerAmount: number;
    providerCurrency: string;
    fxRate: number;
    fxTimestamp: Date;
    status?: ProviderSessionStatus;
    metadata?: any;
    createdAt?: Date;
    updatedAt?: Date;
  }) {
    this._id = params.id;
    this._paymentId = params.paymentId;
    this._provider = params.provider;
    this._providerOrderId = params.providerOrderId;
    this._providerPaymentId = params.providerPaymentId;
    this._providerAmount = Number(params.providerAmount);
    this._providerCurrency = params.providerCurrency;
    this._fxRate = params.fxRate ? Number(params.fxRate) : 0;
    this._fxTimestamp = params.fxTimestamp;
    this._status = params.status ?? ProviderSessionStatus.CREATED;
    this._metadata = params.metadata;
    this._createdAt = params.createdAt ?? new Date();
    this._updatedAt = params.updatedAt ?? new Date();
  }

  updateStatus(status: ProviderSessionStatus) {
    this._status = status;
    this._updatedAt = new Date();
  }

  setRefund(refund: PaymentProviderRefund) {
    if (this._refund) {
      throw new Error('Refund already exists for this session');
    }
    this._refund = refund;
  }

  get refund(): PaymentProviderRefund | undefined {
    return this._refund;
  }

  isRefundable(): boolean {
    return this.status === ProviderSessionStatus.CAPTURED && !this._refund;
  }

  setProviderOrderId(id: string) {
    this._providerOrderId = id;
  }

  setProviderPaymentId(id: string) {
    this._providerPaymentId = id;
  }

  get id(): string {
    return this._id;
  }
  get paymentId(): string {
    return this._paymentId;
  }
  get provider(): PaymentProvider {
    return this._provider;
  }
  get providerOrderId(): string | undefined {
    return this._providerOrderId;
  }
  get providerPaymentId(): string | undefined {
    return this._providerPaymentId;
  }
  get providerAmount(): number {
    return this._providerAmount;
  }
  get providerCurrency(): string {
    return this._providerCurrency;
  }
  get fxRate(): number {
    return this._fxRate;
  }
  get fxTimestamp(): Date {
    return this._fxTimestamp;
  }
  get status(): ProviderSessionStatus {
    return this._status;
  }
  get metadata(): any {
    return this._metadata;
  }
  get createdAt(): Date {
    return this._createdAt;
  }
  get updatedAt(): Date {
    return this._updatedAt;
  }
}
