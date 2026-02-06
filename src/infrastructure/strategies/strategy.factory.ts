import { Injectable } from '@nestjs/common';
import { StripePaymentStrategy } from './stripe-payment.strategy';
import { PayPalPaymentStrategy } from './paypal-payment.strategy';
import { LoggingService } from '@infrastructure/observability/logging/logging.service';
import { PaymentStrategy } from '@application/adaptors/payment-strategy.interface';
import { RazorpayPaymentStrategy } from './razorpay-strategy';
import { PaymentProvider } from '@domain/entities/payments';

@Injectable()
export class StrategyFactory {
  constructor(
    private readonly stripeStrategy: StripePaymentStrategy,
    private readonly paypalStrategy: PayPalPaymentStrategy,
    private readonly razorpayStrategy: RazorpayPaymentStrategy,
    private readonly logger: LoggingService,
  ) {}

  getStrategy(gateway: PaymentProvider): PaymentStrategy {
    try {
      switch (gateway) {
        case PaymentProvider.STRIPE:
          this.logger.debug(`Resolving Stripe strategy`, {
            ctx: StrategyFactory.name,
          });
          return this.stripeStrategy as PaymentStrategy;
        case PaymentProvider.PAYPAL:
          this.logger.debug(`Resolving PayPal strategy`, {
            ctx: StrategyFactory.name,
          });
          return this.paypalStrategy as PaymentStrategy;
        case PaymentProvider.RAZORPAY:
          this.logger.debug(`Resolving Razorpay strategy`, {
            ctx: StrategyFactory.name,
          });
          return this.razorpayStrategy as PaymentStrategy;
        default:
          throw new Error(`Unsupported payment gateway`);
      }
    } catch (error) {
      throw error;
    }
  }
}
