import { ResolvePaymentDto } from 'src/presentation/grpc/dtos/resolve-payment.dto';

export abstract class IResolvePaymentUseCase {
  abstract execute(
    dto: ResolvePaymentDto,
    idempotencyKey: string,
  ): Promise<{
    providerStatus: string;
    isVerified: boolean;
    paymentId: string;
    orderId: string;
    provider: string;
  }>;
}
