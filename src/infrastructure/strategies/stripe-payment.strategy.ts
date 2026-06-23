import { BadRequestException, Injectable } from '@nestjs/common';
import Stripe from 'stripe';
import {
  PaymentStrategy,
  PaymentResult,
  PaymentStatus,
  PaymentRequest,
  RefundRequest,
  ResolvePaymentRequest,
  PaymentSessionResult,
  ResolvePaymentResponse,
  StripeResolveRequest,
  PaymentFailureResult,
  RefundResult,
} from '@application/adaptors/payment-strategy.interface';
import { AppConfigService } from '@infrastructure/config/config.service';
import { LoggingService } from '@infrastructure/observability/logging/logging.service';
import { MetricsService } from '@infrastructure/observability/metrics/metrics.service';
import { TracingService } from '@infrastructure/observability/tracing/trace.service';
import {
  NotFoundException,
  OrderNotFoundException,
} from '@domain/exceptions/domain.exceptions';
import { PaymentProvider } from '@domain/entities/payments';
// import { IExchangeRateService } from '@domain/interfaces/exchange-rate.service';

@Injectable()
export class StripePaymentStrategy implements PaymentStrategy {
  readonly gateway = PaymentProvider.STRIPE;
  private readonly stripe: Stripe;
  private readonly supportedCurrencies: string[] = [
    'USD',
    'EUR',
    'GBP',
    'CAD',
    'AUD',
    'INR',
    'JPY',
  ];

  constructor(
    private readonly configService: AppConfigService,
    // private readonly exchangeRateService: IExchangeRateService,
    private readonly logger: LoggingService,
    private readonly metrics: MetricsService,
    private readonly tracer: TracingService,
  ) {
    this.stripe = new Stripe(this.configService.stripeSecretKey, {
      apiVersion: '2025-08-27.basil',
      timeout: 15000,
      maxNetworkRetries: 3,
      telemetry: false,
      typescript: true,
      appInfo: {
        name: 'EduLearn',
        version: '1.0.0',
      },
    });
  }

  async createPayment(request: PaymentRequest): Promise<PaymentSessionResult> {
    return this.tracer.startActiveSpan(
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
          const currency = request.amount.getCurrency().toLowerCase();

          if (!Array.isArray(request.items) || request.items.length === 0) {
            throw new BadRequestException(
              'No items provided for Stripe payment session.',
            );
          }
          const line_items = request.items.map((item) => ({
            price_data: {
              currency,
              product_data: {
                name: item.name,
                ...(item.imageUrl ? { images: [item.imageUrl] } : {}),
              },
              unit_amount: Number(item.unitAmount.value ?? 0),
            },
            quantity: Number(item.quantity),
          }));

          if (!request.customerEmail) {
            this.logger.warn(
              'No customer email provided in the payment request',
              {
                ctx: 'StripePaymentStrategy',
                userId: request.userId,
              },
            );
          }

          // Use clear fallback to supported cancel/success URLs
          /* The above code is attempting to access the `cancelUrl` property from the `request` object
          in TypeScript. However, the code snippet is incomplete and the actual functionality or
          purpose of this code is not clear without additional context. */
          // const cancelUrl = request.cancelUrl;
          // ||
          // this.configService.stripePaymentCancelUrl ||
          // this.configService.paypalPaymentCancelUrl;
          // const successUrl = request.successUrl;
          //  ||
          // this.configService.stripePaymentSuccessUrl ||
          // this.configService.paypalPaymentCancelUrl;

          const session = await this.stripe.checkout.sessions.create(
            {
              mode: 'payment',
              payment_method_types: ['card', 'link'],
              currency,
              line_items,
              customer_email: request.customerEmail,
              success_url: `${request.successUrl}?session_id={CHECKOUT_SESSION_ID}`,
              cancel_url: `${request.cancelUrl}?orderId=${request.orderId}`,
              metadata: {
                orderId: request.orderId ?? null,
                userId: request.userId,
                ...(request.metadata ?? {}),
                environment: this.configService.nodeEnv ?? 'unknown',
              },
              billing_address_collection: 'auto',
              phone_number_collection: { enabled: false },
              allow_promotion_codes: true,
              locale: 'auto',
              submit_type: 'pay',
            },
            {
              idempotencyKey: request.idempotencyKey,
            },
          );
          if (!session) {
            throw new BadRequestException(
              'Failed to create Stripe checkout session',
            );
          }

          const status = this.mapStripeStatus(session.status || '');

          this.logger.debug('Stripe payment processed successfully', {
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
            providerAmount: session.amount_total!,
            providerCurrency: session.currency!,
            metadata: session,
            provider: PaymentProvider.STRIPE,
            sessionId: session.id,
            publicKey: this.configService.stripePublishableKey,
            sessionStatus: status,
            clientSecret: session.client_secret ?? '',
            url: session.url ?? '',
          };
        } catch (error: any) {
          this.logger.error('Stripe payment failed', {
            error: error?.message,
            ctx: 'StripePaymentStrategy',
            userId: request.userId,
            stripeErrorCode: error?.code,
          });

          this.recordMetrics('process_payment', startTime, false);

          throw error;
        }
      },
    );
  }
  isCurrencySupported(currencyCode: string): boolean {
    if (this.supportedCurrencies.includes(currencyCode.toUpperCase())) {
      return true;
    }
    return false;
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

  //         this.logger.debug(`Stripe payment processed successfully`, {
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

  async refundPayment(request: RefundRequest): Promise<RefundResult> {
    return this.tracer.startActiveSpan(
      'StripePaymentStrategy.processRefund',
      async (span) => {
        span.setAttributes({
          'transaction.id': request.providerPaymentId,
          'refund.amount': request.amount,
          'refund.currency': request.currency,
          gateway: this.gateway,
        });

        const startTime = Date.now();

        try {
          // Validate transactionId and amount
          if (!request.providerPaymentId) {
            throw new BadRequestException('Missing transactionId for refund');
          }
          if (!request.amount || !request.currency) {
            throw new Error('Invalid refund amount');
          }

          const refund = await this.stripe.refunds.create({
            payment_intent: request.providerPaymentId,
            amount: request.amount,
            currency: request.currency,
            reason: 'requested_by_customer',
            metadata: {
              reason: request.reason || '',
            },
          });

          if (!refund) {
            throw new NotFoundException(
              'Stripe refund not found for the given transaction ID',
            );
          }

          const status = this.mapStripeRefundStatus(refund.status);

          this.logger.debug('Stripe refund processed successfully', {
            ctx: 'StripePaymentStrategy',
            transactionId: refund.id,
            status,
            originalTransactionId: request.providerPaymentId,
          });

          this.recordMetrics(
            'process_refund',
            startTime,
            status === PaymentStatus.REFUNDED,
          );

          return {
            refundId: refund.id,
            currency: refund.currency,
            amount: refund.amount,
            status: 'pending',
            metadata: {
              stripeStatus: refund.status,
              amount: refund.amount,
            },
          };
        } catch (error: any) {
          this.logger.error('Stripe refund failed', {
            error: error?.message,
            ctx: 'StripePaymentStrategy',
            transactionId: request.providerPaymentId,
            stripeErrorCode: error?.code,
          });

          this.recordMetrics('process_refund', startTime, false);

          throw error;
        }
      },
    );
  }

  async getPaymentStatus(transactionId: string): Promise<PaymentResult> {
    return this.tracer.startActiveSpan(
      'StripePaymentStrategy.resolvePayment',
      async (span) => {
        span.setAttributes({
          'transaction.id': transactionId,
          gateway: this.gateway,
        });

        try {
          if (!transactionId) {
            throw new BadRequestException(
              'Transaction id is required to get payment status',
            );
          }
          const paymentIntent =
            await this.stripe.paymentIntents.retrieve(transactionId);

          const status = this.mapStripeStatus(paymentIntent.status || '');

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
          this.logger.error('Failed to verify Stripe payment', {
            error: error?.message,
            ctx: 'StripePaymentStrategy',
            transactionId,
          });

          return {
            transactionId,
            status: PaymentStatus.FAILED,
            gateway: this.gateway,
            errorCode: error?.code || 'VERIFICATION_FAILED',
            errorMessage: error?.message,
          };
        }
      },
    );
  }

  async resolvePayment(
    request: ResolvePaymentRequest,
  ): Promise<ResolvePaymentResponse> {
    return this.tracer.startActiveSpan(
      'StripePaymentStrategy.resolvePayment',
      async (span) => {
        // Type guard for StripeResolveRequest
        function isStripeResolveRequest(req: any): req is StripeResolveRequest {
          return req && typeof req.sessionId === 'string';
        }

        if (!isStripeResolveRequest(request)) {
          throw new BadRequestException(
            'Invalid request to verify Stripe payment',
          );
        }
        if (!request.sessionId) {
          throw new BadRequestException(
            'sessionId required to verify stripe payment',
          );
        }

        span.setAttributes({
          'session.id': request.sessionId,
          gateway: this.gateway,
        });

        try {
          const session = await this.stripe.checkout.sessions.retrieve(
            request.sessionId,
            {
              expand: ['payment_intent', 'customer', 'line_items'],
            },
          );
          if (!session) {
            throw new OrderNotFoundException(
              `Invalid order session Id ${request.sessionId}`,
            );
          }

          let paymentIntent;
          if (typeof session.payment_intent === 'string') {
            paymentIntent = await this.stripe.paymentIntents.retrieve(
              session.payment_intent,
            );
          } else if (session.payment_intent) {
            paymentIntent = session.payment_intent;
          } else {
            throw new NotFoundException(
              'Stripe payment Intent not for order Id ' + session.id,
            );
          }

          return {
            paymentIntentId: paymentIntent.id,
            providerStatus: session.payment_status,
            // Payment considered successful if session.payment_status === 'paid'
            isVerified: session.payment_status === 'paid',
          };
        } catch (error: any) {
          this.logger.error('Failed to verify Stripe payment', {
            error: error?.message,
            ctx: 'StripePaymentStrategy',
          });

          throw error;
        }
      },
    );
  }

  /**
   * Mark a payment as failed/cancelled through Stripe and update internal tracking/log/metrics.
   * Handles Stripe PaymentIntents and Checkout Sessions robustly.
   * @param transactionId Stripe PaymentIntent id or Checkout session id
   * @param reason Optional reason for failing the payment
   * @returns Promise<PaymentResult>
   */
  async cancelPayment(
    transactionId: string,
    reason?: string,
  ): Promise<PaymentFailureResult> {
    return this.tracer.startActiveSpan(
      'StripePaymentStrategy.cancelPayment',
      async (span) => {
        span.setAttributes({
          'transaction.id': transactionId,
          'fail.reason': reason,
          gateway: this.gateway,
        });

        const startTime = Date.now();

        try {
          if (!transactionId || typeof transactionId !== 'string') {
            throw new BadRequestException(
              'Invalid or missing transactionId for cancelling payment',
            );
          }

          let paymentIntent: Stripe.PaymentIntent | null = null;
          let isSession = false;

          try {
            paymentIntent =
              await this.stripe.paymentIntents.retrieve(transactionId);
          } catch (e: any) {
            // If not found, it may be a checkout session ID
            if (e.code === 'resource_missing' || e.statusCode === 404) {
              isSession = true;
            } else {
              throw e;
            }
          }

          if (isSession) {
            // Try as session id
            const session = await this.stripe.checkout.sessions.retrieve(
              transactionId,
              { expand: ['payment_intent'] },
            );
            if (
              session?.payment_intent &&
              typeof session.payment_intent === 'string'
            ) {
              paymentIntent = await this.stripe.paymentIntents.retrieve(
                session.payment_intent,
              );
            } else if (
              typeof (session?.payment_intent as any)?.id === 'string'
            ) {
              // Expanded paymentIntent object
              paymentIntent = session.payment_intent as any;
            } else {
              throw new NotFoundException(
                `Stripe payment does not exist for id: ${transactionId}`,
              );
            }
          }

          if (!paymentIntent) {
            throw new NotFoundException(
              `Stripe payment intent not found for id: ${transactionId}`,
            );
          }

          // If already canceled, don't attempt again.
          if (paymentIntent.status === 'canceled') {
            this.logger.warn(
              `Stripe PaymentIntent ${paymentIntent.id} already cancelled.`,
              {
                ctx: 'StripePaymentStrategy',
                transactionId: paymentIntent.id,
              },
            );
            this.recordMetrics('fail_payment', startTime, true);
            return {
              transactionId: paymentIntent.id,
              status: PaymentStatus.CANCELLED,
              success: true,
            };
          }
          const cancellationReason: Stripe.PaymentIntentCancelParams.CancellationReason =
            (reason as Stripe.PaymentIntentCancelParams.CancellationReason) ||
            'requested_by_customer';

          // Cancel the PaymentIntent
          const canceledIntent = await this.stripe.paymentIntents.cancel(
            paymentIntent.id,
            reason
              ? {
                  cancellation_reason: cancellationReason,
                }
              : undefined,
          );

          const status = this.mapStripeStatus(canceledIntent.status);

          this.logger.debug('Stripe payment intent cancelled (cancelPayment)', {
            ctx: 'StripePaymentStrategy',
            transactionId: canceledIntent.id,
            status,
            originalStatus: paymentIntent.status,
            reason,
          });

          this.recordMetrics(
            'fail_payment',
            startTime,
            status === PaymentStatus.CANCELLED,
          );

          return {
            transactionId: canceledIntent.id,
            status,
            success: true,
          };
        } catch (error: any) {
          this.logger.error('Stripe cancelPayment failed', {
            error: error?.message,
            ctx: 'StripePaymentStrategy',
            transactionId,
            reason,
            stripeErrorCode: error?.code,
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
      await this.stripe.balance.retrieve();
      return true;
    } catch (error: any) {
      this.logger.warn('Stripe service unavailable', {
        error: error?.message,
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

  /**
   * Helper: Ensures the requested currency is accepted.
   * If currency=INR, converts amount in-place on the request object (modifies the object).
   * Throws on unsupported currency.
   */
  // private async ensureSupportedOrConvertCurrency(
  //   request: PaymentRequest,
  // ): Promise<void> {
  //   const currency = request.amount.getCurrency().toUpperCase();
  //   if (this.supportedCurrencies.includes(currency.toLowerCase())) {
  //     return;
  //   }
  //   this.logger.info(
  //     `Currency ${currency} not supported by Stripe, converting to USD...`,
  //   );
  //   try {
  //     const rate = await this.exchangeRateService.getRate(currency, 'USD');

  //     if (typeof rate !== 'number' || isNaN(rate)) {
  //       throw new Error('USD rate not found');
  //     }
  //     const inrAmount = request.amount.getAmount();
  //     const usdAmount = Math.round(inrAmount * rate);

  //     request.amount.setAmount(usdAmount);
  //     request.amount.setCurrency('USD');
  //     return;
  //   } catch (error) {
  //     this.logger.error(
  //       'Could not convert currency to USD: ' + (error as Error)?.message,
  //     );
  //     throw new Error('Currency conversion failed');
  //   }
  // }

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
