import { Module } from '@nestjs/common';
import { StripePaymentStrategy } from './stripe-payment.strategy';
import { PayPalPaymentStrategy } from './paypal-payment.strategy';
import { StrategyContext } from './strategy.context';
import { StrategyFactory } from './strategy.factory';
import { RazorpayPaymentStrategy } from './razorpay-strategy';

@Module({
  providers: [
    StripePaymentStrategy,
    PayPalPaymentStrategy,
    RazorpayPaymentStrategy,
    StrategyContext,
    StrategyFactory,
  ],
  exports: [StrategyFactory, StrategyContext],
})
export class StrategyModule {}
