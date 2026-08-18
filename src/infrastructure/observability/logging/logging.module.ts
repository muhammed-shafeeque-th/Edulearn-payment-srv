import { ILoggerService } from '@application/adaptors/logger.service';
import { LoggerModule } from '@edulearn/nest';
import { AppConfigService } from '@infrastructure/config/config.service';
import { Module, Global } from '@nestjs/common';
import { LoggerService } from './logging.service';
@Global()
@Module({
  imports: [
    LoggerModule.forRootAsync({
      inject: [AppConfigService],

      useFactory: (config: AppConfigService) => ({
        environment: config.nodeEnv,
        level: config.logLevel,
        serviceName: config.serviceName,
      }),
    }),
  ],
  providers: [{ provide: ILoggerService, useClass: LoggerService }],
  exports: [ILoggerService],
})
export class AppLoggerModule {}
