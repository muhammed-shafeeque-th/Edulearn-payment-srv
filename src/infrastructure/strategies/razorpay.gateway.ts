import {
  Injectable,
  InternalServerErrorException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import Razorpay from 'razorpay';
import * as crypto from 'crypto';
import {
  PaymentGateway,
  PaymentResult,
  PaymentStatus,
  PaymentRequest,
  RefundRequest,
  ResolvePaymentRequest,
  ResolvePaymentResponse,
  PaymentSessionResult,
  RazorpayResolveRequest,
  PaymentFailureResult,
  RefundResult,
} from '@application/ports/payment-gateway-strategy.interface';
import { AppConfigService } from '@infrastructure/config/config.service';
import { PaymentProvider } from '@domain/entities/payments';
import { ILoggerService } from '@application/ports/logger.service';
import { ITraceService } from '@application/ports/trace.service';
import { IMetricService } from '@application/ports/metric.service';

@Injectable()
export class RazorpayPaymentGateway implements PaymentGateway {
  readonly gateway = 'razorpay';
  private readonly razorpay: Razorpay;
  private readonly supportedCurrencies = Object.freeze(['INR', 'USD']);

  constructor(
    private readonly configService: AppConfigService,
    private readonly _logger: ILoggerService,
    private readonly _tracer: ITraceService,
    private readonly _metrics: IMetricService,
  ) {
    this.razorpay = new Razorpay({
      key_id: this.configService.razorpayKeyId,
      key_secret: this.configService.razorpaySecret,
    });
  }
  isCurrencySupported(currencyCode: string): boolean {
    if (this.supportedCurrencies.includes(currencyCode.toUpperCase())) {
      return true;
    }
    return false;
  }

  async createPayment(request: PaymentRequest): Promise<PaymentSessionResult> {
    return this._tracer.startActiveSpan(
      'RazorpayPaymentGateway.createPayment',
      async (span) => {
        span.setAttributes({
          'user.id': request.userId,
          'payment.amount': request.amount.getAmount(),
          'payment.currency': request.amount.getCurrency(),
          'idempotency.key': request.idempotencyKey,
          gateway: this.gateway,
        });

        const startTime = Date.now();
        try {
          const currency = request.amount.getCurrency().toUpperCase();
          if (!this.supportedCurrencies.includes(currency)) {
            this._logger.warn('Unsupported currency for Razorpay', {
              currency,
              userId: request.userId,
            });
            throw new BadRequestException(
              `Currency ${currency} not supported by Razorpay`,
            );
          }

          // Razorpay expects amount in paise
          const amount = request.amount.getAmount();
          if (amount <= 0) {
            throw new BadRequestException('Amount must be more than zero');
          }

          const orderPayload = {
            amount,
            currency,
            receipt: request.idempotencyKey,
            payment_capture: 1,
            notes: {
              userId: request.userId,
              description:
                request.description || `Payment for user ${request.userId}`,
              ...(request.metadata || {}),
            },
          };

          const order = await this.razorpay.orders.create(orderPayload);

          if (!order?.id) {
            throw new InternalServerErrorException(
              'Failed to create Razorpay order',
            );
          }

          this._logger.debug('Razorpay order created', {
            ctx: 'RazorpayPaymentGateway',
            orderId: order.id,
            userId: request.userId,
          });

          this.recordMetrics('process_payment', startTime, true);

          return {
            providerOrderId: order.id,
            providerAmount: parseInt(order.amount.toString()),
            providerCurrency: order.currency,
            metadata: order,
            provider: PaymentProvider.RAZORPAY,
            orderId: order.id,
            orderStatus: order.status,
            keyId: this.configService.razorpayKeyId,
            amount: parseInt(order.amount.toString()),
            currency: order.currency,
          };
        } catch (error: any) {
          this._logger.error('Razorpay payment failed', {
            error: error?.message,
            ctx: 'RazorpayPaymentGateway',
            userId: request.userId,
            stack: error?.stack,
          });
          this.recordMetrics('process_payment', startTime, false);

          throw error;
        }
      },
    );
  }

  async refundPayment(request: RefundRequest): Promise<RefundResult> {
    return this._tracer.startActiveSpan(
      'RazorpayPaymentGateway.createRefund',
      async (span) => {
        span.setAttributes({
          'transaction.id': request.providerPaymentId,
          'refund.amount': request.amount,
          gateway: this.gateway,
        });

        const startTime = Date.now();

        try {
          const {
            providerPaymentId,
            amount,
            reason,
            // currency,
            // idempotencyKey,
          } = request;
          if (!providerPaymentId) {
            throw new BadRequestException(
              'Transaction ID is required for refund',
            );
          }
          if (amount <= 0) {
            throw new BadRequestException(
              'Refund amount should be greater than zero',
            );
          }
          const refundPayload = {
            amount: amount,
            notes: {
              reason,
            },
          };
          const refund = await this.razorpay.payments.refund(
            providerPaymentId,
            refundPayload,
          );

          if (!refund?.id) {
            throw new InternalServerErrorException('Failed to process refund');
          }

          this._logger.debug('Razorpay refund processed', {
            ctx: 'RazorpayPaymentGateway',
            refundId: refund.id,
            status: refund.status,
          });

          let status: PaymentStatus;
          switch (refund.status) {
            case 'processed':
              status = PaymentStatus.REFUNDED;
              break;
            case 'pending':
              status = PaymentStatus.PENDING;
              break;
            default:
              status = PaymentStatus.FAILED;
          }

          this.recordMetrics(
            'process_refund',
            startTime,
            status === PaymentStatus.REFUNDED,
          );

          return {
            refundId: refund.id,
            currency: refund.currency,
            amount: refund.amount!,
            status: 'pending' as const,
            transactionId: refund.id,
          };
        } catch (error: any) {
          this._logger.error('Razorpay refund failed', {
            error: error?.message,
            ctx: 'RazorpayPaymentGateway',
            transactionId: request.providerPaymentId,
            stack: error?.stack,
          });
          this.recordMetrics('process_refund', startTime, false);
          throw error;
        }
      },
    );
  }

  async getPaymentStatus(transactionId: string): Promise<PaymentResult> {
    return this._tracer.startActiveSpan(
      'RazorpayPaymentGateway.Payment',
      async (span) => {
        span.setAttributes({
          'transaction.id': transactionId,
          gateway: this.gateway,
        });

        try {
          if (!transactionId) {
            throw new BadRequestException('Transaction ID required');
          }

          const payment = await this.razorpay.payments.fetch(transactionId);

          let status: PaymentStatus = PaymentStatus.PENDING;
          switch (payment.status) {
            case 'captured':
              status = PaymentStatus.SUCCESS;
              break;
            case 'failed':
              status = PaymentStatus.FAILED;
              break;
            case 'refunded':
              status = PaymentStatus.REFUNDED;
              break;
            default:
              status = PaymentStatus.PENDING;
          }

          return {
            transactionId: payment.id,
            status,
            gateway: this.gateway,
            metadata: {
              amount: payment.amount,
              currency: payment.currency,
              method: payment.method,
              email: payment.email,
              contact: payment.contact,
              providerStatus: payment.status,
            },
          };
        } catch (error: any) {
          this._logger.error('Failed to verify Razorpay payment', {
            error: error?.message,
            ctx: 'RazorpayPaymentGateway',
            transactionId,
            stack: error?.stack,
          });
          throw error;
        }
      },
    );
  }

  async resolvePayment(
    request: ResolvePaymentRequest,
  ): Promise<ResolvePaymentResponse> {
    // Type guard for RazorpayResolveRequest
    function isRazorpayResolveRequest(req: any): req is RazorpayResolveRequest {
      return (
        req &&
        typeof req.orderId === 'string' &&
        typeof req.paymentId === 'string' &&
        typeof req.signature === 'string'
      );
    }

    if (!isRazorpayResolveRequest(request)) {
      throw new BadRequestException(
        'Invalid request to verify razorpay payment',
      );
    }

    const generated = crypto
      .createHmac('sha256', this.configService.razorpaySecret)
      .update(`${request.orderId}|${request.paymentId}`)
      .digest('hex');

    const isVerified = generated === request.signature;

    return {
      isVerified,
      providerStatus: isVerified ? PaymentStatus.SUCCESS : PaymentStatus.FAILED,
    };
  }

  /**
   * Mark/fail an existing Razorpay payment.
   * - Attempts to "fail" the payment by leveraging Razorpay's available API.
   *   Razorpay does not provide a 'cancel' method on payments; instead, refunds are initiated for captured payments,
   *   and "authorized" payments can sometimes be "voided" by capturing with zero amount or by refund if already captured.
   */
  async cancelPayment(
    transactionId: string,
    reason?: string,
  ): Promise<PaymentFailureResult> {
    return this._tracer.startActiveSpan(
      'RazorpayPaymentGateway.cancelPayment',
      async (span) => {
        span.setAttributes({
          'transaction.id': transactionId,
          gateway: this.gateway,
          reason,
        });

        const startTime = Date.now();
        let updatedPayment: any;
        try {
          if (!transactionId) {
            throw new BadRequestException('Transaction ID required');
          }

          // Fetch existing payment
          let payment: any;
          try {
            payment = await this.razorpay.payments.fetch(transactionId);
          } catch (err) {
            this._logger.error(
              'Razorpay payment fetch failed in cancelPayment',
              {
                error: (err as any)?.message,
                ctx: 'RazorpayPaymentGateway',
                transactionId,
                stack: (err as any)?.stack,
              },
            );
            throw new NotFoundException(
              `Razorpay payment with id ${transactionId} not found`,
            );
          }

          updatedPayment = payment;
          // If payment is authorized, attempt to "void" it by capturing with zero amount, if possible.
          if (payment.status === 'authorized') {
            try {
              // Razorpay .payments.capture expects (id, amount, currency)
              updatedPayment = await this.razorpay.payments.capture(
                transactionId,
                0,
                payment.currency,
              );
              this._logger.debug(
                'Razorpay payment voided (capture with 0 amount)',
                {
                  transactionId,
                  providerStatus: updatedPayment.status,
                  ctx: 'RazorpayPaymentGateway',
                  reason,
                },
              );
            } catch (captureError) {
              this._logger.error(
                'Razorpay payment void (capture with 0) failed in cancelPayment',
                {
                  error: (captureError as any)?.message,
                  ctx: 'RazorpayPaymentGateway',
                  transactionId,
                  stack: (captureError as any)?.stack,
                  reason,
                },
              );
              // Failing to void is not fatal, payment may expire naturally
            }
          } else if (payment.status === 'captured') {
            // Try refunding the full amount as a form of "fail"/reversal
            try {
              updatedPayment = await this.razorpay.payments.refund(
                transactionId,
                {
                  amount: payment.amount,
                  notes: {
                    reason: reason || 'Payment failed by system request',
                  },
                  speed: 'normal',
                },
              );
              this._logger.debug(
                'Razorpay payment refunded during cancelPayment',
                {
                  transactionId,
                  providerStatus: updatedPayment.status,
                  ctx: 'RazorpayPaymentGateway',
                  reason,
                },
              );
            } catch (refundError) {
              this._logger.error(
                'Razorpay payment refund failed in cancelPayment',
                {
                  error: (refundError as any)?.message,
                  ctx: 'RazorpayPaymentGateway',
                  transactionId,
                  stack: (refundError as any)?.stack,
                  reason,
                },
              );
              // Refund failing is not fatal here - user may resolve with Razorpay support
            }
          } else if (
            payment.status === 'refunded' ||
            payment.status === 'failed'
          ) {
            // No further action possible on already terminal payment
            this._logger.warn(
              'Razorpay payment is already finalized, cannot fail',
              {
                transactionId,
                providerStatus: payment.status,
                ctx: 'RazorpayPaymentGateway',
                reason,
              },
            );
          }

          // Custom business logic: You might want to record in DB that this payment is failed.

          this.recordMetrics('fail_payment', startTime, true);

          return {
            transactionId: transactionId,
            status: PaymentStatus.FAILED,
            success: true,
          };
        } catch (error: any) {
          this._logger.error('Failed to fail Razorpay payment', {
            error: error?.message,
            ctx: 'RazorpayPaymentGateway',
            transactionId,
            reason,
            stack: error?.stack,
          });
          this.recordMetrics('fail_payment', startTime, false);
          throw error;
        }
      },
    );
  }

  getSupportedCurrencies(): string[] {
    return [...this.supportedCurrencies];
  }

  async isAvailable(): Promise<boolean> {
    try {
      // Razorpay recommends a quick fetch to check API health
      await this.razorpay.orders.all({ count: 1 });
      return true;
    } catch (error: any) {
      this._logger.warn('Razorpay service unavailable', {
        error: error?.message,
        ctx: 'RazorpayPaymentGateway',
        stack: error?.stack,
      });
      return false;
    }
  }

  /**
   * Internal _metrics helper for payment observability.
   */
  private recordMetrics(
    operation: string,
    startTime: number,
    success: boolean,
  ): void {
    const duration = (Date.now() - startTime) / 1000;

    try {
      this._metrics.paymentLatency.observe(
        { method: operation, gateway: this.gateway },
        duration,
      );

      this._metrics.incPaymentCounter({
        method: operation,
        gateway: this.gateway,
        status: success ? 'success' : 'failure',
      });
    } catch (err) {
      this._logger.warn('Failed to record _metrics', {
        err: (err as any)?.message,
        operation,
      });
    }
  }
}
