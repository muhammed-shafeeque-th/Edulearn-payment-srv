import { Module } from '@nestjs/common';
import { PaymentController } from './payment.controller';
import { PaymentUseCaseModule } from '@application/use-cases/payments/impls/payment-use-case.module';

@Module({
  imports: [PaymentUseCaseModule],
  controllers: [PaymentController],
  providers: [],
})
export class PaymentPresentationModule {}
