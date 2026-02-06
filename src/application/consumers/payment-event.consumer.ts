import { PaymentFailureUseCase } from '@application/use-cases/payments/payment-failure.use-case';
import { SuccessPaymentUseCase } from '@application/use-cases/payments/success-payment.use-case';
import { PaymentProvider } from '@domain/entities/payments';
import { PaymentProviderEvent } from '@domain/events/payment-provider.event';
import { IEventProcessRepository } from '@domain/repositories/event-process-repository.interface';
import { LoggingService } from '@infrastructure/observability/logging/logging.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class PaymentEventConsumer {
  constructor(
    private readonly eventProcessRepository: IEventProcessRepository,
    private readonly successPaymentUseCase: SuccessPaymentUseCase,
    private readonly failedPaymentUseCase: PaymentFailureUseCase,
    private readonly logger: LoggingService,
  ) {}

  async handle(event: PaymentProviderEvent) {
    // Idempotency check
    const exists = await this.eventProcessRepository.isProcessed(
      event.providerEventId,
    );
    if (exists) {
      this.logger.debug(
        `[Event Already Processed] Skipping: ${event.providerEventId} (${event.provider})`,
        { ctx: 'PaymentEventConsumer' },
      );
      return;
    }

    try {
      switch (event.provider) {
        case PaymentProvider.STRIPE: {
          await this.handleStripe(event);
          break;
        }
        case PaymentProvider.PAYPAL: {
          await this.handlePaypal(event);
          break;
        }
        case PaymentProvider.RAZORPAY: {
          await this.handleRazorpay(event);
          break;
        }
        default:
          this.logger.warn(`Unknown provider in webhook: ${event.provider}`, {
            ctx: 'PaymentEventConsumer',
            provider: event.provider,
          });
      }
    } catch (error) {
      this.logger.error(
        `Error handling event: ${event.providerEventId}: ${(error as Error)?.message}`,
        {
          event,
          error,
          ctx: 'PaymentEventConsumer',
        },
      );
      return;
    }

    await this.eventProcessRepository.markAsProcessed(event.providerEventId);
  }

  private async handleStripe(event: PaymentProviderEvent) {
    this.logger.debug(`Handling Stripe webhook: ${event.providerEventType}`, {
      eventId: event.providerEventId,
    });
    const providerOrderId = event.providerPaymentId!;

    // Mark as success
    if (
      event.providerEventType === 'checkout.session.completed' ||
      event.providerEventType === 'payment_intent.succeeded'
    ) {
      await this.successPaymentUseCase.execute(
        PaymentProvider.STRIPE,
        providerOrderId,
      );
      return;
    }

    // Mark as failure
    if (event.providerEventType === 'payment_intent.payment_failed') {
      await this.failedPaymentUseCase.execute(
        PaymentProvider.STRIPE,
        providerOrderId,
      );
      return;
    }

    this.logger.warn(`Unhandled Stripe eventType: ${event.providerEventType}`, {
      eventId: event.providerEventId,
    });
  }

  private async handlePaypal(event: PaymentProviderEvent) {
    this.logger.debug(`Handling PayPal webhook: ${event.providerEventType}`, {
      eventId: event.providerEventId,
    });
    const providerOrderId = event.providerPaymentId!;

    if (event.providerEventType === 'PAYMENT.CAPTURE.COMPLETED') {
      await this.successPaymentUseCase.execute(
        PaymentProvider.PAYPAL,
        providerOrderId,
      );
      return;
    }

    if (
      event.providerEventType === 'PAYMENT.CAPTURE.DENIED' ||
      event.providerEventType === 'PAYMENT.CAPTURE.FAILED'
    ) {
      await this.failedPaymentUseCase.execute(
        PaymentProvider.PAYPAL,
        providerOrderId,
      );
      return;
    }

    this.logger.warn(`Unhandled PayPal eventType: ${event.providerEventType}`, {
      eventId: event.providerEventId,
    });
  }

  private async handleRazorpay(event: PaymentProviderEvent) {
    this.logger.debug(`Handling Razorpay webhook: ${event.providerEventType}`, {
      eventId: event.providerEventId,
    });
    const providerOrderId = event.providerPaymentId!;

    if (
      event.providerEventType === 'payment.captured' ||
      event.providerEventType === 'order.paid'
    ) {
      await this.successPaymentUseCase.execute(
        PaymentProvider.RAZORPAY,
        providerOrderId,
      );
      return;
    }

    if (
      event.providerEventType === 'payment.failed' ||
      event.providerEventType === 'order.failed'
    ) {
      await this.failedPaymentUseCase.execute(
        PaymentProvider.RAZORPAY,
        providerOrderId,
      );
      return;
    }

    this.logger.warn(
      `Unhandled Razorpay eventType: ${event.providerEventType}`,
      { eventId: event.providerEventId },
    );
  }
}
