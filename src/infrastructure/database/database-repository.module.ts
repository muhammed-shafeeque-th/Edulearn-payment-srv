import { Module } from '@nestjs/common';
import { RedisModule } from '@infrastructure/redis/redis.module';
import { DatabaseEntityModule } from './database-entity.module';
import { IPaymentRepository } from '@domain/interfaces/payment-repository.interface';
import { PaymentTypeOrmRepository } from './repositories/payment.repository';
import { RefundTypeOrmRepository } from './repositories/refund.repository';
import { IRefundRepository } from '@domain/interfaces/refund-repository.interface';

@Module({
  imports: [DatabaseEntityModule, RedisModule],
  providers: [
    { provide: IPaymentRepository, useClass: PaymentTypeOrmRepository },
    { provide: IRefundRepository, useClass: RefundTypeOrmRepository },
  ],
  exports: [IPaymentRepository, IRefundRepository],
})
export class DatabaseRepositoryModule {}
