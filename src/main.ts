import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AppConfigService } from '@infrastructure/config/config.service';
import { Transport } from '@nestjs/microservices';
import { LoggingService } from '@infrastructure/observability/logging/logging.service';
import { GrpcExceptionFilter } from '@infrastructure/filters/grpc-exception.filter';
import path from 'path';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {});

  const configService = app.get(AppConfigService);

  const logger = app.get(LoggingService);

  // Setup Prometheus metrics
  app.useLogger(logger);

  // Setup global exception filter for gRPC
  app.useGlobalFilters(new GrpcExceptionFilter(logger));

  // Start gRPC server
  app.connectMicroservice({
    transport: Transport.GRPC,
    options: {
      url: `0.0.0.0:${configService.grpcPort}`,
      package: 'payment_service',
      protoPath: path.join(
        __dirname,
        '..',
        'src',
        'infrastructure',
        'grpc',
        'protos',
        'payment_service.proto',
      ),
      maxSendMessageLength: 10 * 1024 * 1024, // 10MB
      maxReceiveMessageLength: 10 * 1024 * 1024, // 10MB
      keepalive: {
        keepaliveTimeMs: 10000,
        keepaliveTimeoutMs: 5000,
        keepalivePermitWithoutCalls: 1,
      },
    },
  });

  // Start HTTP server for webhooks
  await app.startAllMicroservices();
  await app.listen(configService.apiPort);
  console.log(
    `Payment Service running on port ${configService.apiPort} (HTTP) and ${configService.grpcPort} (gRPC)`,
  );
}
bootstrap();
