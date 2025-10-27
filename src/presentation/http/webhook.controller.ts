import {
  Controller,
  Post,
  Body,
  Headers,
  HttpException,
  HttpStatus,
  UseInterceptors,
  UseGuards,
} from '@nestjs/common';
import { WebhookService } from 'src/presentation/http/webhook.service';
import { AppConfigService } from '@infrastructure/config/config.service';
import { JwtAuthGuard } from '@infrastructure/auth/jwt-auth.guard';
import { LoggingInterceptor } from '@infrastructure/grpc/interceptors/logging.interceptor';
import { MetricsInterceptor } from '@infrastructure/grpc/interceptors/metrics.interceptor';
import { TracingInterceptor } from '@infrastructure/grpc/interceptors/tracing.interceptor';
import Stripe from 'stripe';
import * as crypto from 'crypto';
import axios from 'axios';
import { MetricsService } from '@infrastructure/observability/metrics/metrics.service';
import { TracingService } from '@infrastructure/observability/tracing/trace.service';
import { LoggingService } from '@infrastructure/observability/logging/logging.service';

@Controller('webhook')
@UseGuards(JwtAuthGuard)
@UseInterceptors(LoggingInterceptor, MetricsInterceptor, TracingInterceptor)
export class WebhookController {
  private readonly stripe: Stripe;
  private readonly batchSize = 50;
  private eventBuffer: any[] = [];

  constructor(
    private readonly webhookService: WebhookService,
    private readonly configService: AppConfigService,
    private readonly logger: LoggingService,
    private readonly metrics: MetricsService,
    private readonly tracer: TracingService,
  ) {
    this.stripe = new Stripe(this.configService.stripeApiKey, {
      apiVersion: '2025-08-27.basil',
      maxNetworkRetries: 3,
      timeout: 10000, // 10 seconds
    });
  }

  @Post('stripe')
  async handleStripeWebhook(
    @Body() body: any,
    @Headers('stripe-signature') signature: string,
  ): Promise<void> {
    return await this.tracer.startActiveSpan(
      'WebhookController.handleStripeWebhook',
      async (span) => {
        span.setAttribute('body', body);
        try {
          // Verify Stripe webhook signature
          const webhookSecret = this.configService.stripeWebhookSecret;
          const rawBody = JSON.stringify(body);
          const event = this.stripe.webhooks.constructEvent(
            rawBody,
            signature,
            webhookSecret,
          );

          this.logger.log(`Received Stripe webhook event: ${event.type}`, {
            ctx: 'WebhookController',
          });

          // Type guard for Stripe objects with metadata
          type StripeObjectWithMetadata = {
            id: string;
            metadata?: { userId?: string; orderId?: string };
            amount?: number;
            currency?: string;
          };
          const objectWithMetadata = event.data
            .object as StripeObjectWithMetadata;

          const transformedEvent = {
            paymentId: objectWithMetadata.id,
            userId: objectWithMetadata.metadata?.userId || 'unknown',
            orderId: objectWithMetadata.metadata?.orderId || 'unknown',
            amount: {
              amount: objectWithMetadata.amount || 0,
              currency: objectWithMetadata.currency || 'USD',
            },
            status: event.type.includes('succeeded') ? 'SUCCESS' : 'FAILED',
            transactionId: objectWithMetadata.id,
            eventType: `STRIPE_${event.type.toUpperCase()}`,
            error: null,
          };

          this.eventBuffer.push(transformedEvent);
          if (this.eventBuffer.length >= this.batchSize) {
            await this.flushEvents();
          }

          this.metrics.incWebhookEvents({
            event_type: event.type,
            status: 'SUCCESS',
          });
        } catch (error: any) {
          this.logger.error(
            `Failed to handle Stripe webhook: ${error.message}`,
            { error, ctx: 'WebhookController' },
          );
          this.metrics.incWebhookEvents({
            event_type: 'stripe.unknown',
            status: 'FAILED',
          });
          throw new HttpException(
            'Webhook processing failed',
            HttpStatus.BAD_REQUEST,
          );
        }
      },
    );
  }

  @Post('paypal')
  async handlePayPalWebhook(
    @Body() body: any,
    @Headers('paypal-auth-algo') authAlgo: string,
    @Headers('paypal-cert-url') certUrl: string,
    @Headers('paypal-transmission-id') transmissionId: string,
    @Headers('paypal-transmission-sig') transmissionSig: string,
    @Headers('paypal-transmission-time') transmissionTime: string,
  ): Promise<void> {
    return await this.tracer.startActiveSpan(
      'WebhookController.handlePayPalWebhook',
      async (span) => {
        span.setAttribute('body', body);
        try {
          // Verify PayPal webhook signature
          const webhookId = this.configService.paypalWebhookSecret;
          const isValid = await this.verifyPayPalSignature(
            authAlgo,
            certUrl,
            transmissionId,
            transmissionSig,
            transmissionTime,
            webhookId,
            body,
          );

          if (!isValid) {
            throw new HttpException(
              'Invalid PayPal webhook signature',
              HttpStatus.UNAUTHORIZED,
            );
          }

          this.logger.log(`Received PayPal webhook event: ${body.event_type}`, {
            ctx: 'WebhookController',
          });

          const transformedEvent = {
            paymentId: body.resource?.id || 'unknown',
            userId: body.resource?.payer?.payer_id || 'unknown',
            orderId:
              body.resource?.purchase_units?.[0]?.reference_id || 'unknown',
            amount: {
              amount: parseFloat(body.resource?.amount?.value || '0') * 100,
              currency: body.resource?.amount?.currency_code || 'USD',
            },
            status: body.event_type.includes('COMPLETED')
              ? 'SUCCESS'
              : 'FAILED',
            transactionId: body.resource?.id || 'unknown',
            eventType: `PAYPAL_${body.event_type}`,
            error: null,
          };

          this.eventBuffer.push(transformedEvent);
          if (this.eventBuffer.length >= this.batchSize) {
            await this.flushEvents();
          }

          this.metrics.incWebhookEvents({
            event_type: body.event_type,
            status: 'SUCCESS',
          });
        } catch (error: any) {
          this.logger.error(
            `Failed to handle PayPal webhook: ${error.message}`,
            { error, ctx: 'WebhookController' },
          );
          this.metrics.incWebhookEvents({
            event_type: body.event_type || 'paypal.unknown',
            status: 'FAILED',
          });
          throw new HttpException(
            'Webhook processing failed',
            HttpStatus.BAD_REQUEST,
          );
        }
      },
    );
  }

  private async verifyPayPalSignature(
    authAlgo: string,
    certUrl: string,
    transmissionId: string,
    transmissionSig: string,
    transmissionTime: string,
    webhookId: string,
    body: any,
  ): Promise<boolean> {
    try {
      // Fetch the PayPal certificate
      const response = await axios.get(certUrl);
      const cert = response.data;

      // Create the expected signature string
      const expectedSignature = `${transmissionId}|${transmissionTime}|${webhookId}|${crypto
        .createHash('sha256')
        .update(JSON.stringify(body))
        .digest('hex')}`;

      // Verify the signature
      const verifier = crypto.createVerify(authAlgo);
      verifier.update(expectedSignature);
      verifier.end();

      return verifier.verify(cert, transmissionSig, 'base64');
    } catch (error: any) {
      this.logger.error(`Failed to verify PayPal signature: ${error.message}`, {
        error,
        ctx: 'WebhookController',
      });
      return false;
    }
  }

  private async flushEvents(): Promise<void> {
    if (this.eventBuffer.length === 0) return;

    return await this.tracer.startActiveSpan(
      'WebhookController.flushEvents',
      async (span) => {
        try {
          const events = [...this.eventBuffer];
          this.eventBuffer = [];

          // Process events in parallel to improve throughput
          await Promise.all(
            events.map((event) =>
              this.webhookService.handleWebhookEvent(event),
            ),
          );
          span.setAttribute('flushed', true);

          this.logger.log(`Flushed ${events.length} webhook events to Kafka`, {
            ctx: 'WebhookController',
          });
        } catch (error: any) {
          this.logger.error(
            `Failed to flush webhook events: ${error.message}`,
            { error, ctx: 'WebhookController' },
          );
          throw error;
        }
      },
    );
  }

  // Ensure all events are flushed on shutdown
  async onModuleDestroy(): Promise<void> {
    await this.flushEvents();
    this.logger.log('Flushed remaining webhook events on shutdown', {
      ctx: 'WebhookController',
    });
  }
}
