import { PaymentCreateDto } from 'src/presentation/grpc/dtos/create-payment.dto';

export abstract class ICreatePaymentUseCase {
  abstract execute(dto: PaymentCreateDto): Promise<{
    paymentId: string;
    status: string;
    orderId: string;
  }>;
}
