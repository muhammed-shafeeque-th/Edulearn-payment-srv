import { Global, Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { AppConfigService } from './config.service';
// import { validate } from './validate.config';

@Global()
@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      ...(process.env.DOCKER_ENV != 'true'
        ? { envFilePath: '.env' }
        : { ignoreEnvFile: true }),
      cache: true, // Enable caching for better performance
      // validate: validate,
    }),
  ],
  providers: [AppConfigService],
  exports: [AppConfigService],
})
export class ConfigModule {}
