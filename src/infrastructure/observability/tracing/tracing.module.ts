import { Global, Module } from '@nestjs/common';
import { AppConfigService } from 'src/infrastructure/config/config.service';
import { ITraceService } from '@application/ports/trace.service';
import { TraceService } from './trace.service';
import { TracerModule } from '@edulearn/nest';

@Global()
@Module({
  imports: [
    TracerModule.forRootAsync({
      inject: [AppConfigService],

      useFactory: (config: AppConfigService) => ({
        environment: config.nodeEnv,
        collectorUrl: config.collectorUrl,
        serviceName: config.serviceName,
      }),
    }),
  ],
  providers: [{ provide: ITraceService, useClass: TraceService }],
  exports: [ITraceService],
})
export class AppTracerModule {}
