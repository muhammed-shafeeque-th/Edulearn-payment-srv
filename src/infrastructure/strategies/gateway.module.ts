import { Module } from '@nestjs/common';
import { StripePaymentGateway } from './stripe-payment.gateway';
import { PayPalPaymentGateway } from './paypal-payment.gateway';
import { GatewayContext } from './gateway.context';
import { GatewayFactory } from './gateway.factory';
import { RazorpayPaymentGateway } from './razorpay.gateway';

@Module({
  providers: [
    StripePaymentGateway,
    PayPalPaymentGateway,
    RazorpayPaymentGateway,
    GatewayContext,
    GatewayFactory,
  ],
  exports: [GatewayFactory, GatewayContext],
})
export class GatewayModule {}
