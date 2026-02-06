import { PaymentProvider } from '@domain/entities/payments';
import { Provider } from '@infrastructure/grpc/generated/payment/common';

/**
 * Mapper function to map domain PaymentProvider to proto/grpc Provider.
 * This is the reverse mapping of mapProviderToPaymentProvider.
 */
export function mapProviderToPaymentProvider(
  provider: Provider,
): PaymentProvider {
  switch (provider) {
    case Provider.STRIPE:
      return PaymentProvider.STRIPE;
    case Provider.RAZORPAY:
      return PaymentProvider.RAZORPAY;
    case Provider.PAYPAL:
      return PaymentProvider.PAYPAL;
    default:
      throw new Error('Invalid gateway!.');
  }
}

/*
 * Mapper function to map domain PaymentProvider to proto/grpc Provider.
 * This is the reverse mapping of mapProviderToPaymentProvider.
 */
export function mapPaymentProviderToProvider(
  paymentProvider: PaymentProvider,
): Provider {
  switch (paymentProvider) {
    case PaymentProvider.STRIPE:
      return Provider.STRIPE;
    case PaymentProvider.RAZORPAY:
      return Provider.RAZORPAY;
    case PaymentProvider.PAYPAL:
      return Provider.PAYPAL;
    default:
      throw new Error('Invalid PaymentProvider!');
  }
}
