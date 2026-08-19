import { Injectable } from '@nestjs/common';
import { StripePaymentGateway } from './stripe-payment.gateway';
import { PayPalPaymentGateway } from './paypal-payment.gateway';
import { PaymentGateway } from '@application/ports/payment-gateway-strategy.interface';
import { RazorpayPaymentGateway } from './razorpay.gateway';
import { PaymentProvider } from '@domain/entities/payments';
import { ILoggerService } from '@application/ports/logger.service';

@Injectable()
export class GatewayFactory {
  constructor(
    private readonly stripeGateway: StripePaymentGateway,
    private readonly paypalGateway: PayPalPaymentGateway,
    private readonly razorpayGateway: RazorpayPaymentGateway,
    private readonly _logger: ILoggerService,
  ) {}

  getGateway(gateway: PaymentProvider): PaymentGateway {
    try {
      switch (gateway) {
        case PaymentProvider.STRIPE:
          this._logger.debug(`Resolving Stripe strategy`, {
            ctx: GatewayFactory.name,
          });
          return this.stripeGateway as PaymentGateway;
        case PaymentProvider.PAYPAL:
          this._logger.debug(`Resolving PayPal strategy`, {
            ctx: GatewayFactory.name,
          });
          return this.paypalGateway as PaymentGateway;
        case PaymentProvider.RAZORPAY:
          this._logger.debug(`Resolving Razorpay strategy`, {
            ctx: GatewayFactory.name,
          });
          return this.razorpayGateway as PaymentGateway;
        default:
          throw new Error(`Unsupported payment gateway`);
      }
    } catch (error) {
      throw error;
    }
  }
}
