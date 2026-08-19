import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AppConfigService } from '@infrastructure/config/config.service';
import { Transport } from '@nestjs/microservices';
import path from 'path';
import { getProtoPath, PROTO_ROOT_DIR } from '@edulearn/core';
import bodyParser from 'body-parser';
import { ILoggerService } from '@application/ports/logger.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {});

  const config = app.get(AppConfigService);

  const logger = app.get(ILoggerService);

  // Setup Prometheus metrics
  app.useLogger(logger);

  // Setup global exception filter for gRPC
  // app.useGlobalFilters(new GrpcExceptionFilter(logger));

  // Start gRPC microservice server
  app.connectMicroservice({
    transport: Transport.GRPC,
    options: {
      url: `0.0.0.0:${config.grpcPort}`,
      package: 'payment_service',
      protoPath: [path.join(getProtoPath('payment'))],
      loader: {
        includeDirs: [path.join(PROTO_ROOT_DIR, 'payment')],
      },
      maxSendMessageLength: 10 * 1024 * 1024, // 10MB
      maxReceiveMessageLength: 10 * 1024 * 1024, // 10MB
      keepalive: {
        keepaliveTimeMs: 10000,
        keepaliveTimeoutMs: 5000,
        keepalivePermitWithoutCalls: 1,
      },
    },
  });

  // Start Kafka microservice/consumer
  app.connectMicroservice({
    transport: Transport.KAFKA,
    options: {
      client: {
        clientId: config.kafkaClientId || 'payment-service',
        brokers: config.kafkaBrokers,
      },
      consumer: {
        groupId: config.kafkaConsumerGroup || 'payment-consumer-group',
        sessionTimeout: 30000,
        heartbeatInterval: 3000,
        maxBytesPerPartition: config.kafkaFetchMaxBytes || 1048576,
        retry: {
          retries: 5,
        },
      },
    },
  });

  app.use('/api/webhooks/stripe', bodyParser.raw({ type: 'application/json' }));
  app.use(
    '/api/webhooks/razorpay',
    bodyParser.raw({ type: 'application/json' }),
  );

  // Safe for everything else
  app.use(bodyParser.json());

  // Start all registered microservices (gRPC, Kafka)
  await app.startAllMicroservices();
  // Start HTTP server for webhooks
  await app.listen(config.httpPort);
  console.log(
    `Payment Service running on port ${config.httpPort} (HTTP) and ${config.grpcPort} (gRPC)`,
  );
}
bootstrap();
