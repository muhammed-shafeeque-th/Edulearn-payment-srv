import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppConfigService } from '@infrastructure/config/config.service';
import { PaymentEntity } from './entities/payment.entity';
import { PaymentProviderSessionEntity } from './entities/payment-provider-session.entity';
import { PaymentProviderRefundEntity } from './entities/payment_provider_refund.entity';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (configService: AppConfigService) => ({
        type: 'postgres',
        url: configService.databaseUrl,
        synchronize: configService.nodeEnv !== 'production', // Disabled in production
        logging: ['error'],
        poolSize: configService.databaseMaxConnections,
        entities: [
          PaymentEntity,
          PaymentProviderSessionEntity,
          PaymentProviderRefundEntity,
        ],
        extra: {
          min: configService.databaseMinConnections,
          max: configService.databaseMaxConnections,
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 2000,
        },
        retryAttempts: 3,
        retryDelay: 1000,
      }),
    }),
    TypeOrmModule.forFeature([
      PaymentEntity,
      PaymentProviderSessionEntity,
      PaymentProviderRefundEntity,
    ]),
  ],
  providers: [
    PaymentEntity,
    PaymentProviderSessionEntity,
    PaymentProviderRefundEntity,
  ],
  exports: [
    TypeOrmModule,
    PaymentEntity,
    PaymentProviderSessionEntity,
    PaymentProviderRefundEntity,
  ],
})
export class DatabaseEntityModule {}
