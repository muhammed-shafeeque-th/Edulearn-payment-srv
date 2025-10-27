import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppConfigService } from '@infrastructure/config/config.service';
import { PaymentEntity } from './entities/payment.entity';
import { RefundEntity } from './entities/refund.entity';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (configService: AppConfigService) => ({
        type: 'postgres',
        url: configService.databaseUrl,
        entities: [PaymentEntity, RefundEntity],
        synchronize: configService.nodeEnv !== 'production', // Disabled in production
        logging: ['error'],
        poolSize: configService.databaseMaxConnections,
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
    TypeOrmModule.forFeature([PaymentEntity, RefundEntity]),
  ],
  providers: [PaymentEntity, RefundEntity],
  exports: [TypeOrmModule, PaymentEntity, RefundEntity],
})
export class DatabaseEntityModule {}
