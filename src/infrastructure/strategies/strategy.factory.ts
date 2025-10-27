import { Injectable } from '@nestjs/common';
import { StripePaymentStrategy } from './stripe-payment.strategy';
import { PayPalPaymentStrategy } from './paypal-payment.strategy';
import { LoggingService } from '@infrastructure/observability/logging/logging.service';
import { PaymentStrategy } from '@domain/strategies/payment-strategy.interface';
import { PaymentGateway } from '@domain/entities/payments';
import { RazorpayPaymentStrategy } from './razorpay-strategy';

@Injectable()
export class StrategyFactory {
  constructor(
    private readonly stripeStrategy: StripePaymentStrategy,
    private readonly paypalStrategy: PayPalPaymentStrategy,
    private readonly razorpayStrategy: RazorpayPaymentStrategy,
    private readonly logger: LoggingService,
  ) {}

  getStrategy(gateway: PaymentGateway): PaymentStrategy {
    try {
      switch (gateway) {
        case PaymentGateway.STRIPE:
          this.logger.log(`Resolving Stripe strategy`, {
            ctx: StrategyFactory.name,
          });
          return this.stripeStrategy as PaymentStrategy;
        case PaymentGateway.PAYPAL:
          this.logger.log(`Resolving PayPal strategy`, {
            ctx: StrategyFactory.name,
          });
          return this.paypalStrategy as PaymentStrategy;
        case PaymentGateway.RAZORPAY:
          this.logger.log(`Resolving PayPal strategy`, {
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
