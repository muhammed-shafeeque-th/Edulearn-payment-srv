import { BadRequestException, Injectable } from '@nestjs/common';
import {
  CheckoutPaymentIntent,
  Client,
  Environment,
  LogLevel,
  OrderApplicationContextShippingPreference,
  OrderApplicationContextUserAction,
  OrderRequest,
  OrdersController,
  OrderStatus,
  PaymentsController,
  RefundStatus,
} from '@paypal/paypal-server-sdk';
import {
  PaymentStrategy,
  PaymentResult,
  PaymentStatus,
  PaymentRequest,
  RefundRequest,
  ResolvePaymentRequest,
  ResolvePaymentResponse,
  PaymentSessionResult,
  PaypalResolveRequest,
  PaymentFailureResult,
  RefundResult,
} from '@application/adaptors/payment-strategy.interface';
import { AppConfigService } from '@infrastructure/config/config.service';
import { TracingService } from '@infrastructure/observability/tracing/trace.service';
import { MetricsService } from '@infrastructure/observability/metrics/metrics.service';
import { LoggingService } from '@infrastructure/observability/logging/logging.service';
import { NotFoundException } from '@domain/exceptions/domain.exceptions';
// import { IExchangeRateService } from '@domain/interfaces/exchange-rate.service';
import { PaymentProvider } from '@domain/entities/payments';
// import { ICacheService } from '@domain/interfaces/redis.interface';

@Injectable()
export class PayPalPaymentStrategy implements PaymentStrategy {
  // private readonly EXCHANGE_RATE_TTL_SECONDS = 60; // short TTL (configurable)
  // private readonly OXR_REDIS_KEY = 'oxr:rate:INR:USD';
  readonly gateway = 'paypal';
  private readonly client: Client;
  private readonly ordersController: OrdersController;
  private readonly paymentsController: PaymentsController;
  private readonly supportedCurrencies = [
    'USD',
    'EUR',
    'GBP',
    'CAD',
    'AUD',
    'JPY',
  ];

  constructor(
    private readonly configService: AppConfigService,
    // private readonly exchangeRateService: IExchangeRateService,
    // private readonly redisService: ICacheService,
    private readonly logger: LoggingService,
    private readonly tracer: TracingService,
    private readonly metrics: MetricsService,
  ) {
    const environment =
      this.configService.nodeEnv === 'production'
        ? Environment.Production
        : Environment.Sandbox;

    this.client = new Client({
      clientCredentialsAuthCredentials: {
        oAuthClientId: this.configService.paypalClientId,
        oAuthClientSecret: this.configService.paypalKeySecret,
      },
      environment,
      timeout: 15000, // Increased timeout
      logging: {
        logLevel: LogLevel.Warn,
        logRequest: {
          logBody: false,
        },
        logResponse: {
          logHeaders: false,
        },
      },
      httpClientOptions: {
        retryConfig: {
          maxNumberOfRetries: 3,
          retryOnTimeout: true,
          backoffFactor: 2,
        },
      },
    });

    this.ordersController = new OrdersController(this.client);
    this.paymentsController = new PaymentsController(this.client);
  }

  async createPayment(request: PaymentRequest): Promise<PaymentSessionResult> {
    return this.tracer.startActiveSpan(
      'PayPalPaymentStrategy.createPayment',
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
          // Validate and convert currency if necessary
          // await this.ensureSupportedOrConvertCurrency(request);

          const orderRequest: OrderRequest = {
            intent: CheckoutPaymentIntent.Capture,
            purchaseUnits: [
              {
                items: request.items,
                amount: {
                  currencyCode: request.amount.getCurrency().toUpperCase(),
                  value: (request.amount.getAmount() / 100).toFixed(2),
                },
                description:
                  request.description || `Payment for user ${request.userId}`,
                customId: request.userId,
                invoiceId: request.idempotencyKey,
              },
            ],
            applicationContext: {
              returnUrl:
                request.successUrl ||
                this.configService.paypalPaymentSuccessUrl,
              cancelUrl:
                request.cancelUrl || this.configService.paypalPaymentCancelUrl,
              brandName: 'EduLearn',
              userAction: OrderApplicationContextUserAction.PayNow,
              shippingPreference:
                OrderApplicationContextShippingPreference.NoShipping,
            },
          };

          console.log(
            'OrderRequest : ' + JSON.stringify(orderRequest, null, 2),
          );

          const { result: order } = await this.ordersController.createOrder({
            body: orderRequest,
            paypalRequestId: request.idempotencyKey,
          });

          if (!order?.id) {
            throw new Error('Failed to create PayPal order');
          }

          const approvalUrl = order.links?.find(
            (link) => link.rel === 'approve',
          )?.href;

          return {
            providerOrderId: order.id,
            providerAmount: request.amount.getAmount(),
            providerCurrency: request.amount.getCurrency(),
            metadata: order,
            provider: PaymentProvider.PAYPAL,
            orderId: order.id,
            orderStatus: order.status!,
            approvalLink: approvalUrl!,
          };
        } catch (error: any) {
          this.logger.error(`PayPal payment failed`, {
            error: error?.response?.message,
            details: error?.response?.details,
            paypal: error?.response,
            ctx: 'PayPalPaymentStrategy',
          });
          this.recordMetrics('process_payment', startTime, false);

          throw error;
        }
      },
    );
  }

  async resolvePayment(
    request: ResolvePaymentRequest,
  ): Promise<ResolvePaymentResponse> {
    return this.tracer.startActiveSpan(
      'PayPalPaymentStrategy.capturePayment',
      async () => {
        // Type guard for RazorpayResolveRequest
        function isPaypalResolveRequest(req: any): req is PaypalResolveRequest {
          return (
            req &&
            typeof req.providerOrderId === 'string' &&
            typeof req.idempotencyKey === 'string'
          );
        }

        if (!isPaypalResolveRequest(request)) {
          throw new BadRequestException(
            'Invalid request to verify paypal payment',
          );
        }
        const startTime = Date.now();
        try {
          if (!request?.providerOrderId) {
            throw new BadRequestException(
              'provider order id is required to verify payment',
            );
          }

          const { result: orderResult } =
            await this.ordersController.captureOrder({
              id: request.providerOrderId,
              paypalRequestId: request.idempotencyKey,
            });

          if (!orderResult) {
            throw new NotFoundException(
              'PayPal order capture did not return an order result for Id ' +
                request.providerOrderId,
            );
          }

          const status = this.mapPayPalStatus(orderResult.status);

          this.logger.debug(`PayPal payment processed successfully`, {
            ctx: 'PayPalPaymentStrategy',
            transactionId: orderResult.id,
            status,
          });

          this.recordMetrics(
            'process_payment',
            startTime,
            status === PaymentStatus.SUCCESS,
          );
          return {
            providerStatus: orderResult.status!,
            isVerified: status === PaymentStatus.SUCCESS,
          };
        } catch (error: any) {
          this.logger.error(`PayPal capture failed`, {
            ctx: 'PayPalPaymentStrategy',
            orderId: request?.providerOrderId,
            error: error?.message,
          });
          throw error;
        }
      },
    );
  }
  // async capturePayment(
  //   providerOrderId: string,
  //   idempotencyKey: string,
  // ): Promise<{
  //   status: string;
  //   providerOrderId: string;
  //   provider: PaymentGateway;
  // }> {
  //   return await this.tracer.startActiveSpan(
  //     'PayPalPaymentStrategy.capturePayment',
  //     async () => {
  //       const startTime = Date.now();
  //       try {
  //         const { result: orderResult } =
  //           await this.ordersController.captureOrder({
  //             id: providerOrderId,
  //             paypalRequestId: idempotencyKey,
  //           });

  //         const status = this.mapPayPalStatus(orderResult.status);

  //         this.logger.debug(`PayPal payment processed successfully`, {
  //           ctx: 'PayPalPaymentStrategy',
  //           transactionId: orderResult.id,
  //           status,
  //         });

  //         this.recordMetrics(
  //           'process_payment',
  //           startTime,
  //           status === PaymentStatus.SUCCESS,
  //         );

  //         return {
  //           status,
  //           providerOrderId: orderResult.id,
  //           provider: PaymentGateway.PAYPAL,
  //         };
  //       } catch (error: any) {
  //         this.logger.error(`PayPal capture failed`, {
  //           ctx: 'PayPalPaymentStrategy',
  //           orderId: providerOrderId,
  //           error: error?.message,
  //         });
  //         throw error;
  //       }
  //     },
  //   );
  // }

  async refundPayment(request: RefundRequest): Promise<RefundResult> {
    return this.tracer.startActiveSpan(
      'PayPalPaymentStrategy.createRefund',
      async (span) => {
        const { amount, providerPaymentId, reason } = request;
        span.setAttributes({
          'transaction.id': providerPaymentId,
          'refund.amount': amount,
          gateway: this.gateway,
        });

        const startTime = Date.now();

        try {
          const { result: refund } =
            await this.paymentsController.refundCapturedPayment({
              captureId: request.providerPaymentId,
              body: {
                amount: {
                  currencyCode: request.currency.toUpperCase(),
                  value: (request.amount / 100).toFixed(2),
                },
                // "noteToPayer" is the best place to specify a human-readable refund reason (optional)
                ...(reason && { noteToPayer: reason }),
                invoiceId: `refund_${Date.now()}`,
              },
            });

          if (!refund.id) {
            throw new NotFoundException(
              'PayPal refund did not return an order result for Id ' +
                request.providerPaymentId,
            );
          }

          const status = this.mapPayPalRefundStatus(refund.status);

          this.logger.debug(`PayPal refund processed successfully`, {
            ctx: 'PayPalPaymentStrategy',
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
            currency: refund.amount!.currencyCode,
            amount: parseInt(refund.amount!.value!),
            status: 'pending',
            gateway: this.gateway,
          };
        } catch (error: any) {
          this.logger.error(`PayPal refund failed`, {
            error: error?.message,
            ctx: 'PayPalPaymentStrategy',
            transactionId: request.providerPaymentId,
            paypalErrorCode: error?.code,
          });

          this.recordMetrics('process_refund', startTime, false);

          throw error;
        }
      },
    );
  }

  async getPaymentStatus(transactionId: string): Promise<PaymentResult> {
    return await this.tracer.startActiveSpan(
      'PayPalPaymentStrategy.getPaymentStatus',
      async (span) => {
        span.setAttributes({
          'transaction.id': transactionId,
          gateway: this.gateway,
        });

        try {
          const { result } = await this.ordersController.getOrder({
            id: transactionId,
          });

          if (!result) {
            throw new NotFoundException(
              'PayPal order did not return an order result for Id ' +
                transactionId,
            );
          }

          const status = this.mapPayPalStatus(result?.status);

          return {
            transactionId: result.id!,
            status,
            gateway: this.gateway,
            metadata: {
              paypalStatus: result.status,
              amount: result.purchaseUnits?.[0]?.amount?.value,
              currency: result.purchaseUnits?.[0]?.amount?.currencyCode,
            },
          };
        } catch (error: any) {
          this.logger.error(`Failed to verify PayPal payment`, {
            error: error?.message,
            ctx: 'PayPalPaymentStrategy',
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

  getSupportedCurrencies(): string[] {
    return this.supportedCurrencies;
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.ordersController.getOrder({ id: 'test-order-id' });
      return true;
    } catch (error: any) {
      if (error?.statusCode === 404) {
        return true;
      }
      this.logger.warn('PayPal service unavailable', {
        error: error?.message,
        ctx: 'PayPalPaymentStrategy',
      });
      return false;
    }
  }

  async cancelPayment(
    transactionId: string,
    reason?: string,
  ): Promise<PaymentFailureResult> {
    const startTime = Date.now();

    await this.tracer.startActiveSpan(
      'PayPalPaymentStrategy.cancelPayment',
      async (span) => {
        span.setAttributes({
          'transaction.id': transactionId,
          gateway: this.gateway,
        });
        this.logger.warn('Failing PayPal payment', {
          ctx: 'PayPalPaymentStrategy',
          transactionId,
          reason,
        });

        this.recordMetrics('fail_payment', startTime, false);
      },
    );

    return {
      transactionId,
      status: PaymentStatus.FAILED,
      success: true,
    };
  }
  // private async getInrToUsdRate(): Promise<number> {
  //   const appId = this.configService.openExchangeAppId; // make sure exists
  //   if (!appId) {
  //     this.logger.error('OpenExchange App ID not configured');
  //     throw new Error('Currency conversion unavailable');
  //   }

  //   const redisKey = this.OXR_REDIS_KEY;
  //   try {
  //     // 1) Try Redis cache
  //     const cached = await this.redisService.get(redisKey);
  //     if (cached) {
  //       try {
  //         const parsed = JSON.parse(cached) as ExchangeRateCache;
  //         // small TTL means close-to-real-time but validate
  //         if (
  //           parsed?.rate &&
  //           Date.now() - parsed.timestamp <
  //             this.EXCHANGE_RATE_TTL_SECONDS * 1000 * 5
  //         ) {
  //           // Use cached rate (we still rely on TTL for freshness)
  //           return parsed.rate;
  //         }
  //       } catch (err) {
  //         // fallthrough to fetch
  //       }
  //     }

  //     // 2) Fetch from OpenExchangeRates
  //     // Try direct base=INR first (works if you are on paid plan)
  //     const base = 'INR';
  //     // const symbols = 'USD,INR'; // request both to be safe
  //     const baseParamAllowed = !!this.configService.openExchangeAllowBase; // optionally set in config (true if you upgraded)
  //     let rate: number | null = null;

  //     if (baseParamAllowed) {
  //       const url = `https://openexchangerates.org/api/latest.json?app_id=${encodeURIComponent(appId)}&base=${encodeURIComponent(base)}&symbols=USD`;
  //       const res = await fetch(url, {});
  //       if (res.ok) {
  //         const body = await res.json();
  //         if (body?.rates?.USD && typeof body.rates.USD === 'number') {
  //           rate = body.rates.USD; // INR -> USD directly when base=INR
  //         }
  //       } else {
  //         this.logger.info(
  //           'OpenExchangeRates base=INR fetch failed, will fallback to USD-base method',
  //           { status: res.status },
  //         );
  //       }
  //     }

  //     // If direct base fetch didn't work (e.g. free plan), use USD base and invert
  //     if (rate == null) {
  //       // Fetch USD-base latest (free plan supports USD as base)
  //       const url = `https://openexchangerates.org/api/latest.json?app_id=${encodeURIComponent(appId)}&symbols=INR`;
  //       const res = await fetch(url, {});
  //       if (!res.ok) {
  //         const text = await res.text().catch(() => '');
  //         throw new Error(
  //           `OpenExchangeRates request failed: ${res.status} ${text}`,
  //         );
  //       }
  //       const body = await res.json();
  //       const inrPerUsd = body?.rates?.INR as number | undefined;
  //       if (typeof inrPerUsd !== 'number' || inrPerUsd <= 0) {
  //         throw new Error('Invalid INR rate from OpenExchangeRates');
  //       }
  //       // Now invert: 1 USD = inrPerUsd INR -> 1 INR = 1 / inrPerUsd USD
  //       rate = 1 / inrPerUsd;
  //     }

  //     // 3) Cache into Redis (store rate + timestamp)
  //     const cacheValue: ExchangeRateCache = { rate, timestamp: Date.now() };
  //     try {
  //       // set with TTL seconds
  //       await this.redisService.set(
  //         redisKey,
  //         JSON.stringify(cacheValue),
  //         this.EXCHANGE_RATE_TTL_SECONDS,
  //       );
  //     } catch (err) {
  //       this.logger.warn('Failed to write exchange rate to redis', {
  //         error: (err as Error)?.message,
  //       });
  //     }

  //     return rate;
  //   } catch (err) {
  //     this.logger.error('Failed to fetch INR->USD rate', {
  //       error: (err as Error)?.message,
  //     });

  //     // If Redis has stale cached value return it (defensive)
  //     try {
  //       const stale = await this.redisService.get(redisKey);
  //       if (stale) {
  //         const parsed = JSON.parse(stale) as ExchangeRateCache;
  //         if (parsed?.rate) {
  //           this.logger.warn(
  //             'Using stale cached exchange rate due to fetch failure',
  //           );
  //           return parsed.rate;
  //         }
  //       }
  //     } catch {}

  //     // No fallback — surface error to caller
  //     throw new Error('Currency conversion failed');
  //   }
  // }

  // // Update ensureSupportedOrConvertCurrency to call getInrToUsdRate()
  // private async ensureSupportedOrConvertCurrency(
  //   request: PaymentRequest,
  // ): Promise<void> {
  //   const currency = request.amount.getCurrency().toUpperCase();
  //   if (this.supportedCurrencies.includes(currency)) {
  //     return;
  //   }
  //   if (currency === 'INR') {
  //     this.logger.info(
  //       `Currency INR not supported by PayPal, converting to USD...`,
  //     );
  //     const inrToUsd = await this.getInrToUsdRate();
  //     if (typeof inrToUsd !== 'number' || isNaN(inrToUsd) || inrToUsd <= 0) {
  //       this.logger.error('Exchange rate invalid');
  //       throw new Error('Currency conversion failed');
  //     }
  //     const inrAmount = request.amount.getAmount(); // integer paisa (or cents) based on your domain object
  //     // Convert & round to nearest integer cents (PayPal expects cents)
  //     const usdAmount = Math.round(inrAmount * inrToUsd);
  //     request.amount.setAmount(usdAmount);
  //     request.amount.setCurrency('USD');
  //     return;
  //   }
  //   this.logger.info(
  //     `Currency ${currency} not supported by PayPal and auto-conversion not implemented.`,
  //   );
  //   throw new Error(`Currency ${currency} not supported by PayPal`);
  // }

  isCurrencySupported(currencyCode: string): boolean {
    if (this.supportedCurrencies.includes(currencyCode.toUpperCase())) {
      return true;
    }
    return false;
  }

  // private async ensureSupportedOrConvertCurrency(
  //   request: PaymentRequest,
  // ): Promise<{ rate: number }> {
  //   const currency = request.amount.getCurrency().toUpperCase();
  //   if (this.supportedCurrencies.includes(currency)) {
  //     return { rate: 1 };
  //   }
  //   this.logger.info(
  //     `Currency ${currency} not supported by PayPal, converting to USD...`,
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
  //     return { rate };
  //   } catch (error) {
  //     this.logger.error(
  //       'Could not convert INR to USD: ' + (error as Error)?.message,
  //     );
  //     throw new Error('Currency conversion failed');
  //     // this.logger.info(
  //     //   `Currency ${currency} not supported by PayPal and auto-conversion not implemented.`,
  //     // );
  //     // throw new Error(`Currency ${currency} not supported by PayPal`);
  //   }
  // }
  // private async ensureSupportedOrConvertCurrency(
  //   request: PaymentRequest,
  // ): Promise<void> {
  //   const currency = request.amount.getCurrency().toUpperCase();
  //   if (this.supportedCurrencies.includes(currency)) {
  //     return;
  //   }
  //   if (currency === 'INR') {
  //     // IN PRODUCTION: Use robust infra/caching for rates. Here: simple in-memory, best-effort catch.
  //     this.logger.info(
  //       `Currency INR not supported by PayPal, converting to USD...`,
  //     );
  //     const now = Date.now();
  //     if (
  //       !this.usdInrRateCache ||
  //       now - this.usdInrRateCache.timestamp > 60 * 1000
  //     ) {
  //       const apiKey = this.configService.exchangeRateHostApiKey;
  //       try {
  //         const response = await fetch(
  //           `https://api.exchangerate.host/latest?base=INR&symbols=USD&access_key=${apiKey}`,
  //         );
  //         if (!response.ok) {
  //           throw new Error('Failed to fetch exchange rate');
  //         }
  //         const data = await response.json();
  //         this.logger.info('Exchange data : ' + JSON.stringify(data, null, 2));
  //         const inrToUsd = data?.rates?.['USD'];
  //         if (typeof inrToUsd !== 'number' || isNaN(inrToUsd)) {
  //           throw new Error('USD rate not found');
  //         }
  //         this.usdInrRateCache = {
  //           rate: inrToUsd,
  //           timestamp: now,
  //         };
  //       } catch (err) {
  //         this.logger.error(
  //           'Could not convert INR to USD: ' + (err as Error)?.message,
  //         );
  //         throw new Error('Currency conversion failed');
  //       }
  //     }
  //     const inrToUsd = this.usdInrRateCache?.rate;
  //     if (typeof inrToUsd !== 'number' || isNaN(inrToUsd) || inrToUsd <= 0) {
  //       // Defensive: Another check to catch cache miss or API failure
  //       this.logger.error('Exchange rate cache invalid or missing after fetch');
  //       throw new Error('Currency conversion failed');
  //     }
  //     const inrAmount = request.amount.getAmount();
  //     // Convert & round to nearest integer cent (PayPal expects cents as integer)
  //     const usdAmount = Math.round(inrAmount * inrToUsd);
  //     request.amount.setAmount(usdAmount);
  //     request.amount.setCurrency('USD');
  //     return;
  //   }
  //   this.logger.info(
  //     `Currency ${currency} not supported by PayPal and auto-conversion not implemented.`,
  //   );
  //   throw new Error(`Currency ${currency} not supported by PayPal`);
  // }

  private mapPayPalStatus(paypalStatus?: OrderStatus): PaymentStatus {
    switch (paypalStatus) {
      case OrderStatus.Completed:
        return PaymentStatus.SUCCESS;
      case OrderStatus.Created:
      case OrderStatus.Saved:
      case OrderStatus.Approved:
      case OrderStatus.PayerActionRequired:
        return PaymentStatus.PENDING;
      case OrderStatus.Voided:
        return PaymentStatus.CANCELLED;
      default:
        return PaymentStatus.FAILED;
    }
  }

  private mapPayPalRefundStatus(paypalStatus?: RefundStatus): PaymentStatus {
    switch (paypalStatus) {
      case RefundStatus.Completed:
        return PaymentStatus.REFUNDED;
      case RefundStatus.Pending:
        return PaymentStatus.PENDING;
      case RefundStatus.Failed:
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
