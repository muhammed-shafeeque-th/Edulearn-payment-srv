import { Global, Module } from '@nestjs/common';
import { MetricService } from './metrics.service';
import { IMetricService } from '@application/ports/metric.service';
import { MetricsModule } from '@edulearn/nest';
import { AppConfigService } from '@infrastructure/config/config.service';

@Global()
@Module({
  imports: [
    MetricsModule.forRootAsync({
      inject: [AppConfigService],

      useFactory: (config: AppConfigService) => ({
        namespace: 'payment_service',
        defaultLabels: {
          service: config.serviceName,
        },
      }),
    }),
  ],
  providers: [{ provide: IMetricService, useClass: MetricService }],
  exports: [IMetricService],
})
export class AppMetricsModule {}
