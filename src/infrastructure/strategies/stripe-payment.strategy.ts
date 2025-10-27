import { Injectable } from '@nestjs/common';
import Stripe from 'stripe';
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
import { PaymentGateway } from '@domain/entities/payments';
import { OrderNotFoundException } from '@domain/exceptions/domain.exceptions';

@Injectable()
export class StripePaymentStrategy implements PaymentStrategy {
  readonly gateway = 'stripe';
  private readonly stripe: Stripe;
  private readonly supportedCurrencies = [
    'usd',
    'eur',
    'gbp',
    'cad',
    'aud',
    'jpy',
  ];

  constructor(
    private readonly configService: AppConfigService,
    private readonly logger: LoggingService,
    private readonly metrics: MetricsService,
    private readonly tracer: TracingService,
  ) {
    this.stripe = new Stripe(this.configService.stripeSecretKey, {
      apiVersion: '2025-08-27.basil',
      timeout: 15000, // Increased timeout
      maxNetworkRetries: 3,
      telemetry: false,
      typescript: true,
      appInfo: {
        name: 'EduLearn',
        version: '1.0.0',
      },
    });
  }

  async createPayment<T = any>(request: PaymentRequest): Promise<T> {
    return await this.tracer.startActiveSpan(
      'StripePaymentStrategy.createPayment',
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
          // Validate currency support
          if (
            !this.supportedCurrencies.includes(
              request.amount.getCurrency().toLowerCase(),
            )
          ) {
            // throw new Error(
            //   `Currency ${request.amount.getCurrency()} not supported by Stripe`,
            // );
            this.logger.info(
              `Currency ${request.amount.getCurrency()} not supported by Stripe, converting to USD...`,
            );
            request.amount.setCurrency('USD');
          }

          const session = await this.stripe.checkout.sessions.create(
            {
              // Payment configuration
              mode: 'payment', // 'payment' | 'subscription' | 'setup'
              payment_method_types: ['card', 'link'], // Add more as needed

              // Line items

              currency: request.amount.getCurrency().toLowerCase(),

              line_items: request.items?.map((item) => ({
                price_data: {
                  currency: request.amount.getCurrency().toLowerCase(),
                  product_data: {
                    name: item.name,
                    // description: item.description,
                    images: [item.imageUrl!], // Optional
                  },
                  unit_amount: parseInt(item.unitAmount.value || '0'),
                },
                quantity: parseInt(item.quantity),
              })),

              // Customer information
              customer_email: request.customerEmail,
              // customer: validatedData.customerId, // If existing Stripe customer

              // Redirect URLs
              success_url:
                request.successUrl ||
                `${this.configService.paypalPaymentCancelUrl}`,
              cancel_url:
                request.cancelUrl ||
                `${this.configService.paypalPaymentCancelUrl}`,

              // Metadata (searchable in Stripe Dashboard)
              metadata: {
                userId: request.userId,
                ...request.metadata,
                environment: this.configService.nodeEnv!,
              },

              // Additional settings
              billing_address_collection: 'auto',
              phone_number_collection: {
                enabled: false,
              },

              // Allow promotion codes
              allow_promotion_codes: true,

              // Shipping (if physical products)
              // shipping_address_collection: {
              //   allowed_countries: ['US', 'CA', 'GB'],
              // },

              // Tax calculation (if enabled)
              // automatic_tax: {
              //   enabled: true,
              // },

              // Session expiration (default 24 hours)
              expires_at: Math.floor(Date.now() / 1000) + 3600, // 1 hour

              // Locale
              locale: 'auto',

              // Submit type
              submit_type: 'pay',

              // Custom fields (collect additional info)
              // custom_fields: [
              //   {
              //     key: 'orderNotes',
              //     label: { type: 'custom', custom: 'Order Notes' },
              //     type: 'text',
              //     optional: true,
              //   },
              // ],
            },
            {
              idempotencyKey: request.idempotencyKey,
            },
          );
          const status = this.mapStripeStatus(session.status!);

          this.logger.log(`Stripe payment processed successfully`, {
            ctx: 'StripePaymentStrategy',
            sessionId: session.id,
            status,
            userId: request.userId,
          });

          this.recordMetrics(
            'process_payment',
            startTime,
            status === PaymentStatus.SUCCESS,
          );

          return {
            providerOrderId: session.id,
            providerStatus: session.status,
            status,
            gateway: this.gateway,
            clientSecret: session.client_secret,
            metadata: {
              amountReceived: session.amount_total,
            },
          } as T;
        } catch (error: any) {
          this.logger.error(`Stripe payment failed`, {
            error: error.message,
            ctx: 'StripePaymentStrategy',
            userId: request.userId,
            stripeErrorCode: error.code,
          });

          this.recordMetrics('process_payment', startTime, false);

          throw error;
        }
      },
    );
  }
  // async createPayment<T = any>(request: PaymentRequest): Promise<T> {
  //   return await this.tracer.startActiveSpan(
  //     'StripePaymentStrategy.createPayment',
  //     async (span) => {
  //       span.setAttributes({
  //         'user.id': request.userId,
  //         'payment.amount': request.amount.getAmount(),
  //         'payment.currency': request.amount.getCurrency(),
  //         'idempotency.key': request.idempotencyKey,
  //         gateway: this.gateway,
  //       });

  //       const startTime = Date.now();

  //       try {
  //         // Validate currency support
  //         if (
  //           !this.supportedCurrencies.includes(
  //             request.amount.getCurrency().toLowerCase(),
  //           )
  //         ) {
  //           // throw new Error(
  //           //   `Currency ${request.amount.getCurrency()} not supported by Stripe`,
  //           // );
  //           this.logger.info(
  //             `Currency ${request.amount.getCurrency()} not supported by Stripe, converting to USD...`,
  //           );
  //           request.amount.setCurrency('USD');
  //         }

  //         // Create payment intent with enhanced options
  //         const paymentIntent = await this.stripe.paymentIntents.create(
  //           {
  //             amount: request.amount.getAmount(),
  //             currency: request.amount.getCurrency().toLowerCase(),
  //             metadata: {
  //               userId: request.userId,
  //               ...request.metadata,
  //             },
  //             description:
  //               request.description || `Payment for user ${request.userId}`,
  //             confirm: true,
  //             payment_method: 'pm_card_visa', // For testing - should be dynamic in production
  //             off_session: true,
  //             receipt_email: request.customerEmail,
  //             automatic_payment_methods: {
  //               enabled: true,
  //               allow_redirects: 'never',
  //             },
  //           },
  //           { idempotencyKey: request.idempotencyKey },
  //         );

  //         const status = this.mapStripeStatus(paymentIntent.status);

  //         this.logger.log(`Stripe payment processed successfully`, {
  //           ctx: 'StripePaymentStrategy',
  //           transactionId: paymentIntent.id,
  //           status,
  //           userId: request.userId,
  //         });

  //         this.recordMetrics(
  //           'process_payment',
  //           startTime,
  //           status === PaymentStatus.SUCCESS,
  //         );

  //         return {
  //           paymentIntentId: paymentIntent.id,
  //           status,
  //           gateway: this.gateway,
  //           clientSecret: paymentIntent.client_secret,
  //           metadata: {
  //             stripeStatus: paymentIntent.status,
  //             amountReceived: paymentIntent.amount_received,
  //           },
  //         } as T;
  //       } catch (error: any) {
  //         this.logger.error(`Stripe payment failed`, {
  //           error: error.message,
  //           ctx: 'StripePaymentStrategy',
  //           userId: request.userId,
  //           stripeErrorCode: error.code,
  //         });

  //         this.recordMetrics('process_payment', startTime, false);

  //         throw error;
  //       }
  //     },
  //   );
  // }

  async createRefund(request: RefundRequest): Promise<PaymentResult> {
    return await this.tracer.startActiveSpan(
      'StripePaymentStrategy.processRefund',
      async (span) => {
        span.setAttributes({
          'transaction.id': request.transactionId,
          'refund.amount': request.amount.getAmount(),
          gateway: this.gateway,
        });

        const startTime = Date.now();

        try {
          const refund = await this.stripe.refunds.create({
            payment_intent: request.transactionId,
            amount: request.amount.getAmount(),
            reason: 'requested_by_customer',
            metadata: {
              reason: request.reason,
              ...request.metadata,
            },
          });

          const status = this.mapStripeRefundStatus(refund.status);

          this.logger.log(`Stripe refund processed successfully`, {
            ctx: 'StripePaymentStrategy',
            transactionId: refund.id,
            status,
            originalTransactionId: request.transactionId,
          });

          this.recordMetrics(
            'process_refund',
            startTime,
            status === PaymentStatus.REFUNDED,
          );

          return {
            transactionId: refund.id,
            status,
            gateway: this.gateway,
            metadata: {
              stripeStatus: refund.status,
              amount: refund.amount,
            },
          };
        } catch (error: any) {
          this.logger.error(`Stripe refund failed`, {
            error: error.message,
            ctx: 'StripePaymentStrategy',
            transactionId: request.transactionId,
            stripeErrorCode: error.code,
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
      'StripePaymentStrategy.verifyPayment',
      async (span) => {
        span.setAttributes({
          'transaction.id': transactionId,
          gateway: this.gateway,
        });

        try {
          const paymentIntent =
            await this.stripe.paymentIntents.retrieve(transactionId);

          const status = this.mapStripeStatus(paymentIntent.status);

          return {
            transactionId: paymentIntent.id,
            status,
            gateway: this.gateway,
            metadata: {
              stripeStatus: paymentIntent.status,
              amount: paymentIntent.amount,
              currency: paymentIntent.currency,
            },
          };
        } catch (error: any) {
          this.logger.error(`Failed to verify Stripe payment`, {
            error: error.message,
            ctx: 'StripePaymentStrategy',
            transactionId,
          });

          return {
            transactionId,
            status: PaymentStatus.FAILED,
            gateway: this.gateway,
            errorCode: error.code || 'VERIFICATION_FAILED',
            errorMessage: error.message,
          };
        }
      },
    );
  }
  async verifyPayment(sessionId: string): Promise<{
    paymentStatus: Stripe.Checkout.Session.PaymentStatus;
    providerOrderStatus: Stripe.Checkout.Session.Status;
    providerOrderId: string;
    provider: PaymentGateway;
  }> {
    return await this.tracer.startActiveSpan(
      'StripePaymentStrategy.verifyPayment',
      async (span) => {
        span.setAttributes({
          'session.id': sessionId,
          gateway: this.gateway,
        });

        try {
          const session = await this.stripe.checkout.sessions.retrieve(
            sessionId,
            {
              expand: ['payment_intent', 'customer', 'line_items'],
            },
          );

          if (!session) {
            throw new OrderNotFoundException(
              `Invalid order session Id ${sessionId}`,
            );
          }

          return {
            paymentStatus: session.payment_status!,
            providerOrderStatus: session.status!,
            providerOrderId: session.id,
            provider: PaymentGateway.STRIPE,
          };
        } catch (error: any) {
          this.logger.error(`Failed to verify Stripe payment`, {
            error: error.message,
            ctx: 'StripePaymentStrategy',
          });

          throw error;
        }
      },
    );
  }

  getSupportedCurrencies(): string[] {
    return this.supportedCurrencies;
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.stripe.balance.retrieve();
      return true;
    } catch (error: any) {
      this.logger.warn('Stripe service unavailable', {
        error: error.message,
        ctx: 'StripePaymentStrategy',
      });
      return false;
    }
  }

  private mapStripeStatus(stripeStatus: string): PaymentStatus {
    switch (stripeStatus) {
      case 'succeeded':
        return PaymentStatus.SUCCESS;
      case 'processing':
      case 'requires_payment_method':
      case 'requires_confirmation':
      case 'requires_action':
        return PaymentStatus.PENDING;
      case 'canceled':
        return PaymentStatus.CANCELLED;
      default:
        return PaymentStatus.FAILED;
    }
  }

  private mapStripeRefundStatus(stripeStatus: string | null): PaymentStatus {
    switch (stripeStatus) {
      case 'succeeded':
        return PaymentStatus.REFUNDED;
      case 'pending':
        return PaymentStatus.PENDING;
      case 'failed':
        return PaymentStatus.FAILED;
      default:
        return PaymentStatus.FAILED;
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
