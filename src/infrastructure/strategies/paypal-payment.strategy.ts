import { Injectable } from '@nestjs/common';
import {
  // ApiError,
  CheckoutPaymentIntent,
  Client,
  Environment,
  LogLevel,
  OrderApplicationContextShippingPreference,
  OrderApplicationContextUserAction,
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
} from '@domain/strategies/payment-strategy.interface';
import { AppConfigService } from '@infrastructure/config/config.service';
import { TracingService } from '@infrastructure/observability/tracing/trace.service';
import { MetricsService } from '@infrastructure/observability/metrics/metrics.service';
import { LoggingService } from '@infrastructure/observability/logging/logging.service';
import { PaymentGateway } from '@domain/entities/payments';

@Injectable()
export class PayPalPaymentStrategy implements PaymentStrategy {
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

  async createPayment<T = any>(request: PaymentRequest): Promise<T> {
    return await this.tracer.startActiveSpan(
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
          // Validate currency support
          if (
            !this.supportedCurrencies.includes(
              request.amount.getCurrency().toUpperCase(),
            )
          ) {
            // throw new Error(
            //   `Currency ${request.amount.getCurrency()} not supported by PayPal`,
            // );
            this.logger.info(
              `Currency ${request.amount.getCurrency()} not supported by PayPal, converting to USD...`,
            );
            request.amount.setCurrency('USD');
          }

          // Create order with enhanced options
          const { result: orderResult } =
            await this.ordersController.createOrder({
              body: {
                intent: CheckoutPaymentIntent.Capture,
                purchaseUnits: [
                  {
                    items: request.items,
                    amount: {
                      currencyCode: request.amount.getCurrency().toUpperCase(),
                      value: (request.amount.getAmount() / 100).toFixed(2),
                    },
                    description:
                      request.description ||
                      `Payment for user ${request.userId}`,
                    customId: request.userId,
                    invoiceId: request.idempotencyKey,
                  },
                ],

                applicationContext: {
                  returnUrl:
                    request.successUrl ||
                    this.configService.paypalPaymentSuccessUrl,
                  cancelUrl:
                    request.cancelUrl ||
                    this.configService.paypalPaymentCancelUrl,
                  brandName: 'EduLearn',
                  userAction: OrderApplicationContextUserAction.PayNow,
                  shippingPreference:
                    OrderApplicationContextShippingPreference.NoShipping,
                },
              },
              paypalRequestId: request.idempotencyKey,
            });

          if (!orderResult.id) {
            throw new Error('Failed to create PayPal order');
          }

          // // Capture payment

          const approvalUrl = orderResult.links?.find(
            (link) => link.rel === 'approve',
          )?.href;

          return {
            providerOrderId: orderResult.id!,
            providerOrderStatus: orderResult.status,
            status: 'PENDING',
            gateway: this.gateway,
            redirectUrl: approvalUrl, // frontend should redirect user here
            metadata: {
              orderId: orderResult.id,
              amount:
                orderResult.purchaseUnits?.[0]?.payments?.captures?.[0]?.amount
                  ?.value,
            },
          } as T;
        } catch (error: any) {
          this.logger.error(`PayPal payment failed`, {
            error: error.message,
            ctx: 'PayPalPaymentStrategy',
            userId: request.userId,
            paypalErrorCode: error.code,
          });

          this.recordMetrics('process_payment', startTime, false);

          throw error;
        }
      },
    );
  }

  /**
   * Step 2: Capture order after user approves (called from return_url)
   */
  async capturePayment(
    providerOrderId: string,
    idempotencyKey: string,
  ): Promise<{
    status: string;
    providerOrderId: string;
    provider: PaymentGateway;
  }> {
    return await this.tracer.startActiveSpan(
      'paypal.capturePayment',
      async () => {
        try {
          const startTime = Date.now();
          const { result: orderResult } =
            await this.ordersController.captureOrder({
              id: providerOrderId,
              paypalRequestId: idempotencyKey,
            });

          const status = this.mapPayPalStatus(orderResult!.status);

          this.logger.log(`PayPal payment processed successfully`, {
            ctx: 'PayPalPaymentStrategy',
            transactionId: orderResult.id,
            status,
          });

          this.recordMetrics(
            'process_payment',
            startTime,
            status === PaymentStatus.SUCCESS,
          );
          // const request = new OrdersCaptureRequest(providerOrderId);
          // request.requestBody({}); // empty body for capture
          // request.headers['PayPal-Request-Id'] = idempotencyKey;

          // const response = await this.client.execute(request);

          // this..inc({ provider: 'paypal', status: 'captured' });
          // span.end();

          return {
            status: this.mapPayPalStatus(orderResult.status!),
            providerOrderId: orderResult.id!,
            provider: PaymentGateway.PAYPAL,
          };
        } catch (error) {
          this.logger.error(`PayPal capture failed`, {
            ctx: 'PayPalPaymentStrategy',
            orderId: providerOrderId,
          });
          throw error;
        }
      },
    );
  }

  async createRefund(request: RefundRequest): Promise<PaymentResult> {
    return await this.tracer.startActiveSpan(
      'PayPalPaymentStrategy.createRefund',
      async (span) => {
        span.setAttributes({
          'transaction.id': request.transactionId,
          'refund.amount': request.amount.getAmount(),
          gateway: this.gateway,
        });

        const startTime = Date.now();

        try {
          const { result: refundResult } =
            await this.paymentsController.refundCapturedPayment({
              captureId: request.transactionId,
              body: {
                amount: {
                  currencyCode: request.amount.getCurrency().toUpperCase(),
                  value: (request.amount.getAmount() / 100).toFixed(2),
                },
                noteToPayer: request.reason,
                invoiceId: `refund_${Date.now()}`,
              },
            });

          const status = this.mapPayPalRefundStatus(refundResult.status);

          this.logger.log(`PayPal refund processed successfully`, {
            ctx: 'PayPalPaymentStrategy',
            transactionId: refundResult.id,
            status,
            originalTransactionId: request.transactionId,
          });

          this.recordMetrics(
            'process_refund',
            startTime,
            status === PaymentStatus.REFUNDED,
          );

          return {
            transactionId: refundResult.id!,
            status,
            gateway: this.gateway,
            metadata: {
              paypalStatus: refundResult.status,
              amount: refundResult.amount?.value,
            },
          };
        } catch (error: any) {
          this.logger.error(`PayPal refund failed`, {
            error: error.message,
            ctx: 'PayPalPaymentStrategy',
            transactionId: request.transactionId,
            paypalErrorCode: error.code,
          });

          this.recordMetrics('process_refund', startTime, false);

          throw error;
        }
      },
    );
  }

  async getPaymentStatus(transactionId: string): Promise<PaymentResult> {
    return await this.tracer.startActiveSpan(
      'PayPalPaymentStrategy.verifyPayment',
      async (span) => {
        span.setAttributes({
          'transaction.id': transactionId,
          gateway: this.gateway,
        });

        try {
          const { result } = await this.ordersController.getOrder({
            id: transactionId,
          });

          const status = this.mapPayPalStatus(result!.status);

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
            error: error.message,
            ctx: 'PayPalPaymentStrategy',
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

  getSupportedCurrencies(): string[] {
    return this.supportedCurrencies;
  }

  async isAvailable(): Promise<boolean> {
    try {
      // Test PayPal connectivity by making a simple API call
      await this.ordersController.getOrder({ id: 'test-order-id' });
      return true;
    } catch (error: any) {
      // If it's a 404 error, the service is available but the test order doesn't exist
      if (error.statusCode === 404) {
        return true;
      }

      this.logger.warn('PayPal service unavailable', {
        error: error.message,
        ctx: 'PayPalPaymentStrategy',
      });
      return false;
    }
  }

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
