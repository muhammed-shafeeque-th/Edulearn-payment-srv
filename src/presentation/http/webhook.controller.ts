import {
  Controller,
  Post,
  Body,
  Headers,
  HttpException,
  HttpStatus,
  UseInterceptors,
  Req,
  OnModuleDestroy,
  UseFilters,
} from '@nestjs/common';
import { Request } from 'express';
import { WebhookService } from 'src/presentation/http/webhook.service';
import { AppConfigService } from '@infrastructure/config/config.service';
import { LoggingInterceptor } from '@infrastructure/grpc/interceptors/logging.interceptor';
import { MetricsInterceptor } from '@infrastructure/grpc/interceptors/metrics.interceptor';
import { TracingInterceptor } from '@infrastructure/grpc/interceptors/tracing.interceptor';
import Stripe from 'stripe';
import * as crypto from 'crypto';
import axios from 'axios';

import { PaymentProvider } from '@domain/entities/payments';
import { PaymentProviderEvent } from '@domain/events/payment-provider.event';
import { ICacheService } from '@application/ports/redis.interface';
import { BaseExceptionFilter } from '@nestjs/core';
import { ILoggerService } from '@application/ports/logger.service';
import { ITraceService } from '@application/ports/trace.service';
import { IMetricService } from '@application/ports/metric.service';

@Controller('api/webhooks')
@UseFilters(BaseExceptionFilter)
@UseInterceptors(LoggingInterceptor, MetricsInterceptor, TracingInterceptor)
export class WebhookController implements OnModuleDestroy {
  private readonly stripe: Stripe;
  private readonly STRIPE_ALLOWED_EVENTS: Set<string> = new Set([
    'checkout.session.completed',
    'payment_intent.succeeded',
    'payment_intent.payment_failed',
    'charge.refunded',
  ]);

  private readonly RAZORPAY_ALLOWED_EVENTS: Set<string> = new Set([
    'payment.captured',
    'payment.failed',
    'order.paid',
    'refund.processed',
    'subscription.charged',
  ]);

  constructor(
    private readonly webhookService: WebhookService,
    private readonly configService: AppConfigService,
    private readonly _cache: ICacheService,
    private readonly _logger: ILoggerService,
    private readonly _tracer: ITraceService,
    private readonly _metrics: IMetricService,
  ) {
    this.stripe = new Stripe(this.configService.stripeSecretKey, {
      apiVersion: '2025-08-27.basil',
      maxNetworkRetries: 3,
      timeout: 10_000,
    });
  }

  @Post('stripe')
  async handleStripeWebhook(
    @Headers('stripe-signature') signature: string,
    @Req() req: Request,
  ): Promise<void> {
    return await this._tracer.startActiveSpan(
      'WebhookController.handleStripeWebhook',
      async () => {
        try {
          const webhookSecret = this.configService.stripeWebhookSecret;
          // Stripe requires the raw request body to verify signatures
          // const rawBody = (req as any).rawBody;
          const rawBody = req.body as Buffer;
          if (!rawBody) {
            this._logger.warn('Failing fast rawBody not found in request', {
              ctx: WebhookController.name,
            });
            return;
          }

          let event: Stripe.Event;
          try {
            event = this.stripe.webhooks.constructEvent(
              rawBody,
              signature,
              webhookSecret,
            );
          } catch (error: any) {
            this._metrics.incWebhookEvents({
              event_type: 'stripe.signature_error',
              status: 'FAILED',
            });
            this._logger.error(`Invalid Stripe signature: ${error.message}`, {
              error,
              ctx: 'WebhookController',
            });
            return;
          }

          this._logger.debug(`Received Stripe webhook event: ${event.type}`, {
            ctx: 'WebhookController',
            eventId: event.id,
          });

          if (!this.STRIPE_ALLOWED_EVENTS.has(event.type)) {
            this._logger.warn(`Stripe event type not allowed: ${event.type}`, {
              ctx: 'WebhookController',
            });
            return;
          }

          const object = event.data.object as any;
          const normalized: PaymentProviderEvent = {
            provider: PaymentProvider.STRIPE,
            providerEventId: event.id,
            providerEventType: event.type,
            providerPaymentId: object.id,
            orderId: object.metadata?.orderId,
            occurredAt: new Date(event.created * 1000),
            raw: event,
          };

          await this.webhookService.publish(normalized);
          this._metrics.incWebhookEvents({
            event_type: event.type,
            status: 'SUCCESS',
          });
        } catch (error: any) {
          this._logger.error(
            `Failed to handle Stripe webhook: ${error.message}`,
            { error, ctx: 'WebhookController' },
          );
          this._metrics.incWebhookEvents({
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
    return await this._tracer.startActiveSpan(
      'WebhookController.handlePayPalWebhook',
      async () => {
        try {
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
            this._metrics.incWebhookEvents({
              event_type: (body && body.event_type) || 'paypal.invalid_sig',
              status: 'FAILED',
            });
            this._logger.warn(
              `Invalid PayPal webhook signature for event: ${
                body?.event_type || 'unknown'
              }`,
              { ctx: 'WebhookController' },
            );
            return;
          }

          this._logger.debug(
            `Received PayPal webhook event: ${body.event_type}`,
            {
              ctx: 'WebhookController',
            },
          );

          const resource = body.resource ?? {};

          const normalized: PaymentProviderEvent = {
            provider: PaymentProvider.PAYPAL,
            providerEventId: body.id,
            providerEventType: body.event_type,
            providerPaymentId: resource.id,
            orderId: resource.purchase_units?.[0]?.reference_id,
            occurredAt: new Date(body.create_time),
            raw: body,
          };

          await this.webhookService.publish(normalized);
          this._metrics.incWebhookEvents({
            event_type: body?.event_type || 'paypal.unknown',
            status: 'SUCCESS',
          });
        } catch (error: any) {
          this._logger.error(
            `Failed to handle PayPal webhook: ${error.message}`,
            { error, ctx: 'WebhookController' },
          );
          this._metrics.incWebhookEvents({
            event_type: body?.event_type || 'paypal.unknown',
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

  @Post('razorpay')
  async handleRazorpayWebhook(
    @Body() body: any,
    @Headers('x-razorpay-signature') signature: string,
    @Headers('x-razorpay-event-id') eventId: string,
    @Req() req: Request,
  ): Promise<void> {
    return await this._tracer.startActiveSpan(
      'WebhookController.handleRazorpayWebhook',
      async () => {
        let eventType = 'razorpay.unknown';

        try {
          const razorpaySecret = this.configService.razorpayWebhookSecret;
          if (!razorpaySecret) {
            this._logger.error('Razorpay webhook secret is not configured', {
              ctx: 'WebhookController',
            });
            throw new HttpException(
              'Webhook secret not configured',
              HttpStatus.INTERNAL_SERVER_ERROR,
            );
          }

          // const rawBody = (req as any).rawBody;
          const rawBody = req.body as Buffer;
          if (!rawBody) {
            this._logger.warn('Failing fast rawBody not found in request', {
              ctx: WebhookController.name,
            });
            return;
          }

          const expectedSignature = crypto
            .createHmac('sha256', razorpaySecret)
            .update(rawBody)
            .digest('hex');

          if (signature !== expectedSignature) {
            this._metrics.incWebhookEvents({
              event_type: 'unknown',
              status: 'FAILED',
            });
            this._logger.warn(
              `Invalid Razorpay webhook signature for razorpay webhook event`,
              { ctx: 'WebhookController' },
            );
            return;
          }
          let parsedBody;

          try {
            parsedBody = JSON.parse(rawBody.toString('utf8'));
          } catch (err) {
            this._logger.warn('Could not parse Razorpay webhook body as JSON', {
              ctx: WebhookController.name,
              rawLength: rawBody.length || undefined,
              err,
            });
            return;
          }

          eventType = parsedBody?.event;

          this._logger.debug(`Received Razorpay webhook event: ${eventType}`, {
            ctx: 'WebhookController',
            eventId:
              eventId ??
              (body?.payload?.payment?.entity?.id /* Razorpay payment_id */ ||
                body?.payload?.order?.entity?.id) /* Razorpay order_id */,
          });

          if (!this.RAZORPAY_ALLOWED_EVENTS.has(eventType)) {
            this._logger.warn(`Razorpay event type not allowed: ${eventType}`, {
              ctx: 'WebhookController',
            });
            return;
          }

          // Normalization of Razorpay's webhook object structure
          // So entity.id could be a payment_id (pay_xxx), order_id (order_xxx), or refund_id.
          const entity =
            parsedBody?.payload?.payment?.entity ||
            parsedBody?.payload?.order?.entity ||
            parsedBody?.payload?.refund?.entity ||
            {};

          const normalized: PaymentProviderEvent = {
            provider: PaymentProvider.RAZORPAY,
            providerEventId: eventId,
            providerEventType: eventType,
            providerPaymentId: entity.order_id,
            orderId: entity.order_id,
            occurredAt: entity.created_at
              ? new Date(entity.created_at * 1000)
              : new Date(),
            raw: parsedBody,
          };

          await this.webhookService.publish(normalized);

          this._metrics.incWebhookEvents({
            event_type: eventType,
            status: 'SUCCESS',
          });
        } catch (error: any) {
          this._logger.error(
            `Failed to handle Razorpay webhook: ${error.message}`,
            { error, ctx: 'WebhookController' },
          );
          this._metrics.incWebhookEvents({
            event_type: eventType,
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
      // Cert cache key derived from the cert url (hash for length safety)
      const certCacheKey = `paypal_cert:${crypto
        .createHash('sha256')
        .update(certUrl)
        .digest('hex')}`;

      let cert: string | null = await this._cache.get(certCacheKey);

      if (!cert) {
        // Not found in cache, fetch and store
        const response = await axios.get(certUrl, { responseType: 'text' });
        cert = response.data;

        if (!cert) {
          this._logger.error(
            `Fetched empty or invalid cert from PayPal cert_url: ${certUrl}`,
            { ctx: 'WebhookController', url: certUrl },
          );
          return false;
        }
        // Set TTL to 12 hours (43200 seconds)
        await this._cache.set(certCacheKey, cert, 43200);
        this._logger.debug(
          `Fetched and cached PayPal cert for url: ${certUrl}`,
          {
            ctx: 'WebhookController',
          },
        );
      } else {
        this._logger.debug(`PayPal cert cache hit for url: ${certUrl}`, {
          ctx: 'WebhookController',
        });
      }

      const expectedSignature = `${transmissionId}|${transmissionTime}|${webhookId}|${crypto
        .createHash('sha256')
        .update(JSON.stringify(body))
        .digest('hex')}`;
      const verifier = crypto.createVerify(authAlgo);
      verifier.update(expectedSignature);
      verifier.end();

      const isValid = verifier.verify(cert, transmissionSig, 'base64');
      if (!isValid) {
        this._logger.warn('PayPal signature verification failed.', {
          ctx: 'WebhookController',
        });
      }
      return isValid;
    } catch (error: any) {
      this._logger.error(
        `Failed to verify PayPal signature: ${error.message}`,
        {
          error,
          ctx: 'WebhookController',
        },
      );
      return false;
    }
  }

  onModuleDestroy(): void {
    this._logger.debug('WebhookController destroyed', {
      ctx: 'WebhookController',
    });
  }
}
