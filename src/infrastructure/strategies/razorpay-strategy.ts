import { Injectable } from '@nestjs/common';
import Razorpay from 'razorpay';
import * as crypto from 'crypto';
import {
  PaymentStrategy,
  PaymentResult,
  PaymentStatus,
  PaymentRequest,
  RefundRequest,
} from '@domain/strategies/payment-strategy.interface';
import { AppConfigService } from '@infrastructure/config/config.service';
import { LoggingService } from '@infrastructure/observability/logging/logging.service';
import { MetricsService } from '@infrastructure/observability/metrics/metrics.service';
import { TracingService } from '@infrastructure/observability/tracing/trace.service';

@Injectable()
export class RazorpayPaymentStrategy implements PaymentStrategy {
  readonly gateway = 'razorpay';
  private readonly razorpay: Razorpay;
  private readonly supportedCurrencies = ['INR', 'USD'];

  constructor(
    private readonly configService: AppConfigService,
    private readonly logger: LoggingService,
    private readonly metrics: MetricsService,
    private readonly tracer: TracingService,
  ) {
    this.razorpay = new Razorpay({
      key_id: this.configService.razorpayKeyId,
      key_secret: this.configService.razorpaySecret,
    });
  }

  async createPayment<T = any>(request: PaymentRequest): Promise<T> {
    return await this.tracer.startActiveSpan(
      'RazorpayPaymentStrategy.createPayment',
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
          // Validate currency
          if (
            !this.supportedCurrencies.includes(
              request.amount.getCurrency().toUpperCase(),
            )
          ) {
            throw new Error(
              `Currency ${request.amount.getCurrency()} not supported by Razorpay`,
            );
          }

          // Step 1: Create Razorpay Order
          const order = await this.razorpay.orders.create({
            amount: request.amount.getAmount(), // amount in paise
            currency: request.amount.getCurrency().toUpperCase(),
            receipt: request.idempotencyKey,
            notes: {
              userId: request.userId,
              description:
                request.description || `Payment for user ${request.userId}`,
            },
          });

          if (!order.id) {
            throw new Error('Failed to create Razorpay order');
          }

          this.logger.log('Razorpay order created', {
            ctx: 'RazorpayPaymentStrategy',
            orderId: order.id,
            userId: request.userId,
          });

          // ⚠️ Important: At this stage, payment is NOT captured yet.
          // Razorpay Checkout on client side will complete it.
          // We return orderId so frontend can use Razorpay React SDK.

          this.recordMetrics('process_payment', startTime, true);

          return {
            providerOrderId: order.id,
            providerOrderStatus: order.status,
            gateway: this.gateway,
            status: PaymentStatus.PENDING,
            keyId: this.configService.razorpayKeyId,
            metadata: {
              providerAmount: order.amount,
              providerCurrency: order.currency,
            },
          } as T;
        } catch (error: any) {
          this.logger.error('Razorpay payment failed', {
            error: error.message,
            ctx: 'RazorpayPaymentStrategy',
            userId: request.userId,
          });

          this.recordMetrics('process_payment', startTime, false);

          throw error;
        }
      },
    );
  }

  async createRefund(request: RefundRequest): Promise<PaymentResult> {
    return await this.tracer.startActiveSpan(
      'RazorpayPaymentStrategy.createRefund',
      async (span) => {
        span.setAttributes({
          'transaction.id': request.transactionId,
          'refund.amount': request.amount.getAmount(),
          gateway: this.gateway,
        });

        const startTime = Date.now();

        try {
          const refund = await this.razorpay.payments.refund(
            request.transactionId,
            {
              amount: request.amount.getAmount(),

              notes: {
                reason: request.reason,
                ...request.metadata,
              },
            },
          );

          this.logger.log('Razorpay refund processed', {
            ctx: 'RazorpayPaymentStrategy',
            refundId: refund.id,
            status: refund.status,
          });

          const status =
            refund.status === 'processed'
              ? PaymentStatus.REFUNDED
              : refund.status === 'pending'
                ? PaymentStatus.PENDING
                : PaymentStatus.FAILED;

          this.recordMetrics(
            'process_refund',
            startTime,
            status === PaymentStatus.REFUNDED,
          );

          return {
            transactionId: refund.id,
            providerRefundId: refund.id,
            status,

            gateway: this.gateway,
            metadata: {
              amount: refund.amount,

              // speed: refund.speed,
            },
          } as PaymentResult;
        } catch (error: any) {
          this.logger.error('Razorpay refund failed', {
            error: error.message,
            ctx: 'RazorpayPaymentStrategy',
            transactionId: request.transactionId,
          });

          this.recordMetrics('process_refund', startTime, false);
          throw error;
          // return {
          //   transactionId: '',
          //   status: PaymentStatus.FAILED,
          //   gateway: this.gateway,
          //   errorCode: error.code || 'UNKNOWN_ERROR',
          //   errorMessage: error.message,
          // };
        }
      },
    );
  }

  async getPaymentStatus(transactionId: string): Promise<PaymentResult> {
    return await this.tracer.startActiveSpan(
      'RazorpayPaymentStrategy.verifyPayment',
      async (span) => {
        span.setAttributes({
          'transaction.id': transactionId,
          gateway: this.gateway,
        });

        try {
          const payment = await this.razorpay.payments.fetch(transactionId);

          let status: PaymentStatus = PaymentStatus.PENDING;
          if (payment.status === 'captured') status = PaymentStatus.SUCCESS;
          else if (payment.status === 'failed') status = PaymentStatus.FAILED;

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
            },
          };
        } catch (error: any) {
          this.logger.error('Failed to verify Razorpay payment', {
            error: error.message,
            ctx: 'RazorpayPaymentStrategy',
            transactionId,
          });

          // return {
          //   transactionId,
          //   status: PaymentStatus.FAILED,
          //   gateway: this.gateway,
          //   errorCode: error.code || 'VERIFICATION_FAILED',
          //   errorMessage: error.message,
          // };
          throw error;
        }
      },
    );
  }

  // Signature verification (important for webhook/checkout callback)
  verifySignature(
    orderId: string,
    paymentId: string,
    signature: string,
  ): boolean {
    const generated = crypto
      .createHmac('sha256', this.configService.razorpaySecret)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');
    return generated === signature;
  }

  getSupportedCurrencies(): string[] {
    return this.supportedCurrencies;
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.razorpay.orders.all({ count: 1 });
      return true;
    } catch (error: any) {
      this.logger.warn('Razorpay service unavailable', {
        error: error.message,
        ctx: 'RazorpayPaymentStrategy',
      });
      return false;
    }
  }

  private recordMetrics(
    operation: string,
    startTime: number,
    success: boolean,
  ): void {
    const duration = (Date.now() - startTime) / 1000;

    this.metrics.paymentLatency.observe(
      { method: operation, gateway: this.gateway },
      duration,
    );

    this.metrics.incPaymentCounter({
      method: operation,
      gateway: this.gateway,
      status: success.toString(),
    });
  }
}
