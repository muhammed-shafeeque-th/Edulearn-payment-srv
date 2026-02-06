import { Injectable } from '@nestjs/common';
import { ConfigService as NestConfigService } from '@nestjs/config';

@Injectable()
export class AppConfigService {
  constructor(private readonly configService: NestConfigService) {}

  // Service config
  get nodeEnv(): string {
    return this.configService.get<string>('NODE_ENV', 'development');
  }
  get serviceName(): string {
    return this.configService.get<string>('SERVICE_NAME', 'PaymentService');
  }

  get apiPort(): number {
    return this.configService.get<number>('API_PORT', 4005);
  }
  get appUrl(): string {
    return this.configService.get<string>(
      'APP_URL',
      `localhost:${this.apiPort}`,
    );
  }
  get paypalPaymentSuccessUrl(): string {
    return this.configService.get<string>(
      'PAYPAL_PAYMENT_SUCCESS_URL',
      'http://locahost:9000/payment/success',
    );
  }
  get paypalPaymentCancelUrl(): string {
    return this.configService.get<string>(
      'PAYPAL_PAYMENT_CANCEL_URL',
      'http://locahost:9000/payment/cancel',
    );
  }

  get grpcPort(): number {
    return this.configService.get<number>('GRPC_PORT', 50055);
  }

  get userGrpcUrl(): string {
    return this.configService.get<string>(
      'USER_SERVICE_GRPC',
      'user_srv:50052',
    );
  }
  get courseGrpcUrl(): string {
    return this.configService.get<string>(
      'COURSE_SERVICE_GRPC',
      'course_srv:50053',
    );
  }
  get orderGrpcUrl(): string {
    return this.configService.get<string>(
      'ORDER_SERVICE_GRPC',
      'order_srv:50054',
    );
  }
  get openExchangeAppId(): string {
    return this.configService.get<string>('OPENEXCHANGE_APP_ID', '');
  }
  get openExchangeAllowBase(): boolean {
    return this.configService.get<boolean>('OPENEXCHANGE_ALLOW_BASE', false);
  }
  get exchangeRateHostApiKey(): string {
    return this.configService.get<string>('EXCHANGERATEHOST_API_KEY', '');
  }

  // Payment gateways config
  get stripePublishableKey(): string {
    return this.configService.get<string>('STRIPE_PUBLISHABLE_KEY')!;
  }
  get stripeSecretKey(): string {
    return this.configService.get<string>('STRIPE_SECRET_KEY')!;
  }

  get paypalClientId(): string {
    return this.configService.get<string>('PAYPAL_CLIENT_ID')!;
  }

  get paypalKeySecret(): string {
    return this.configService.get<string>('PAYPAL_SECRET')!;
  }

  get paypalWebhookSecret(): string {
    return this.configService.get<string>('PAYPAL_WEBHOOK_SECRET')!;
  }
  get razorpayKeyId(): string {
    return this.configService.get<string>('RAZORPAY_KEY_ID')!;
  }

  get razorpaySecret(): string {
    return this.configService.get<string>('RAZORPAY_SECRET')!;
  }

  get razorpayWebhookSecret(): string {
    return this.configService.get<string>('RAZORPAY_WEBHOOK_SECRET')!;
  }

  get stripeWebhookSecret(): string {
    return this.configService.get<string>('STRIPE_WEBHOOK_SECRET')!;
  }

  // DB config
  get databaseUrl(): string {
    return this.configService.get<string>(
      'DATABASE_URL',
      'postgresql://postgres:password@localhost:5432/payment_service',
    );
  }

  get databaseMaxConnections(): number {
    return this.configService.get<number>('DATABASE_MAX_CONNECTIONS', 50);
  }

  get databaseMinConnections(): number {
    return this.configService.get<number>('DATABASE_MIN_CONNECTIONS', 10);
  }

  // Kafka config
  get kafkaBrokers(): string[] {
    return this.configService
      .get<string>('KAFKA_BROKER', 'localhost:9092')
      .split(',');
  }

  get kafkaClientId(): string {
    return this.configService.get<string>('KAFKA_CLIENT_ID', 'payment-service');
  }

  get kafkaConsumerGroup(): string {
    return this.configService.get<string>(
      'KAFKA_CONSUMER_GROUP',
      'payment-service-group',
    );
  }

  get kafkaMaxPollRecords(): number {
    return this.configService.get<number>('KAFKA_MAX_POLL_RECORDS', 100);
  }

  get kafkaFetchMaxBytes(): number {
    return this.configService.get<number>('KAFKA_FETCH_MAX_BYTES', 5242880);
  }

  // Redis config
  get redisUrl(): string {
    return this.configService.get<string>(
      'REDIS_URL',
      'redis://localhost:6379/0',
    );
  }
  get redisKeyPrefix(): string {
    return this.configService.get<string>(
      'REDIS_KEY_PREFIX',
      'edulearn:payment:',
    );
  }

  get redisMaxConnections(): number {
    return this.configService.get<number>('REDIS_MAX_CONNECTIONS', 100);
  }

  get redisMinConnections(): number {
    return this.configService.get<number>('REDIS_MIN_CONNECTIONS', 10);
  }

  get redisTtlDefault(): number {
    return this.configService.get<number>('REDIS_TTL_DEFAULT', 86400);
  }

  // Observability config
  get jaegerEndpoint(): string {
    return this.configService.get<string>(
      'JAEGER_ENDPOINT',
      'http://localhost:4318/v1/traces',
    );
  }
  get tracingSamplingRatio(): number {
    return this.configService.get<number>('TRACING_SAMPLING_RATIO', 0.1);
  }
  get logLevel(): string {
    return this.configService.get<string>('LOG_LEVEL', 'info');
  }

  get jaegerHost(): string {
    return this.configService.get<string>('JAEGER_HOST', 'localhost');
  }

  get jaegerPort(): number {
    return this.configService.get<number>('JAEGER_PORT', 6831);
  }

  get lokiUrl(): string {
    return this.configService.get<string>('LOKI_URL', 'http://loki:3100');
  }

  get prometheusPort(): number {
    return this.configService.get<number>('PROMETHEUS_PORT', 9091);
  }

  // JWT config
  get jwtSecret(): string {
    return this.configService.get<string>('JWT_SECRET', 'your-secret-key');
  }

  get jwtExpiresIn(): string {
    return this.configService.get<string>('JWT_EXPIRES_IN', '1h');
  }
}
