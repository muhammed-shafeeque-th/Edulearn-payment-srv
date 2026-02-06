# Payment Service 

## Purpose

The Payment Service is responsible for payment processing, payment provider integrations (Stripe, PayPal, Razorpay), refund management, and payment lifecycle management in the EduLearn platform. It serves as the central service for all payment-related operations, ensuring secure, reliable, and idempotent payment processing.

## Scope & Responsibilities

### Core Responsibilities

1. **Payment Processing**
   - Create payment sessions for multiple providers
   - Handle payment resolution and verification
   - Process payment cancellations
   - Manage payment status transitions
   - Support multiple payment providers simultaneously

2. **Multi-Provider Integration**
   - **Stripe**: Credit cards, digital wallets, SEPA, iDEAL
   - **PayPal**: PayPal accounts, credit cards
   - **Razorpay**: Cards, UPI, Net Banking, Wallets (India-focused)
   - Strategy pattern for provider abstraction
   - Unified API across all providers

3. **Payment Lifecycle Management**
   - Payment state machine with valid transitions
   - Payment timeout handling (10-minute default)
   - Automatic expiration of pending payments
   - Scheduled sweeper for expired payments

4. **Webhook Processing**
   - Secure webhook signature verification
   - Normalized webhook event handling
   - Idempotent webhook processing
   - Provider-specific webhook mappings

5. **Refund Processing**
   - Initiate refunds for successful payments
   - Track refund status
   - Handle partial and full refunds
   - Provider-specific refund handling

6. **Currency & Exchange**
   - Multi-currency support (USD, EUR, GBP, INR)
   - Exchange rate fetching and caching
   - Currency conversion for cross-border payments
   - Provider currency mapping

7. **Idempotency Management**
   - Idempotent payment creation
   - Redis-based idempotency key storage
   - Duplicate request prevention
   - Idempotent webhook processing

8. **Event Publishing**
   - Publishes payment lifecycle events to Kafka
   - Events: PaymentInitiated, PaymentSucceeded, PaymentFailed, PaymentTimeout, PaymentCancelled
   - Event-driven integration with Order Service

### Out of Scope

- Order management (handled by Order Service)
- User management (handled by User Service)
- Course management (handled by Course Service)
- Invoice generation (handled by Order/Invoice Service)
- Tax calculation (handled by Order Service)

## Folder Structure 
```
payment/
├── src/                          # Source code
│   ├── app.module.ts            # NestJS root module
│   ├── main.ts                  # Application entry point
│   ├── application/             # Application layer
│   │   ├── adaptors/            # Interface adapters
│   │   │   ├── exchange-rate.service.ts    # Currency exchange service
│   │   │   ├── kafka-producer.interface.ts # Kafka producer interface
│   │   │   ├── payment-strategy.interface.ts # Payment strategy interface
│   │   │   └── redis.interface.ts           # Redis interface
│   │   ├── consumers/           # Kafka consumers
│   │   │   ├── event-consumer.module.ts    # Consumer module
│   │   │   └── payment-event.consumer.ts   # Payment event consumer
│   │   ├── dtos/                # Data Transfer Objects
│   │   │   ├── cancel-payment.dto.ts       # Payment cancellation DTO
│   │   │   ├── create-payment.dto.ts       # Payment creation DTO
│   │   │   ├── payment-failure.dto.ts      # Payment failure DTO
│   │   │   └── resolve-payment.dto.ts      # Payment resolution DTO
│   │   ├── schedulers/          # Scheduled tasks
│   │   │   ├── payment-schedule.module.ts  # Scheduler module
│   │   │   └── payment-timeout-sweeper.ts  # Timeout sweeper
│   │   └── use-cases/           # Business use cases
│   │       ├── payments/        # Payment use cases
│   │       │   ├── cancel-payment.use-case.ts     # Payment cancellation
│   │       │   ├── create-payment.use-case.ts     # Payment creation
│   │       │   ├── handle-payment-timeout.use-case.ts # Timeout handling
│   │       │   ├── payment-failure.use-case.ts    # Payment failure
│   │       │   ├── resolve-payment.use-case.ts    # Payment resolution
│   │       │   └── success-payment.use-case.ts    # Payment success
│   ├── domain/                  # Domain layer
│   │   ├── entities/            # Domain entities
│   │   │   ├── payment-provider-session.entity.ts # Provider session
│   │   │   ├── payments.ts      # Payment aggregate
│   │   │   ├── refund-provider.entity.ts # Refund provider
│   │   │   ├── refund.ts        # Refund entity
│   │   │   └── transaction.ts   # Transaction entity
│   │   ├── events/              # Domain events
│   │   │   └── domain-events.ts # Payment domain events
│   │   ├── exceptions/          # Domain exceptions
│   │   │   └── domain.exceptions.ts # Payment exceptions
│   │   ├── repositories/        # Repository interfaces
│   │   │   └── payment-repository.interface.ts # Payment repository
│   │   └── value-objects/       # Value objects
│   │       ├── idempotency-key.ts # Idempotency key
│   │       └── money.ts         # Money value object
│   ├── infrastructure/          # Infrastructure layer
│   │   ├── auth/                # Authentication
│   │   │   └── jwt.strategy.ts  # JWT authentication strategy
│   │   ├── config/              # Configuration
│   │   │   ├── app.config.ts    # Application configuration
│   │   │   ├── database.config.ts # Database configuration
│   │   │   └── kafka.config.ts  # Kafka configuration
│   │   ├── database/            # Database implementation
│   │   │   ├── entities/        # TypeORM entities
│   │   │   ├── mappers/         # Data mappers
│   │   │   └── repositories/    # Repository implementations
│   │   ├── exchange/            # Currency exchange
│   │   │   └── exchange-rate.service.ts # Exchange rate service
│   │   ├── filters/             # Exception filters
│   │   │   └── grpc-exception.filter.ts # gRPC exception handling
│   │   ├── grpc/                # gRPC clients
│   │   │   ├── clients/         # gRPC client implementations
│   │   │   └── interceptors/    # gRPC interceptors
│   │   ├── kafka/               # Kafka event handling
│   │   │   ├── producer.ts      # Event producer
│   │   │   └── topics.ts        # Topic definitions
│   │   ├── observability/       # Monitoring
│   │   │   ├── logging/         # Logging setup
│   │   │   ├── metrics/         # Metrics collection
│   │   │   └── tracing/         # Distributed tracing
│   │   ├── pipe/                # Validation pipes
│   │   │   └── grpc-validation.pipe.ts # gRPC validation pipe
│   │   ├── redis/               # Redis implementation
│   │   │   ├── redis.service.ts # Redis service
│   │   │   └── cache.service.ts # Caching service
│   │   ├── services/            # Infrastructure services
│   │   │   └── idempotency.service.ts # Idempotency service
│   │   ├── strategies/          # Payment strategies
│   │   │   ├── paypal-payment.strategy.ts # PayPal strategy
│   │   │   ├── razorpay-strategy.ts       # Razorpay strategy
│   │   │   ├── stripe-payment.strategy.ts # Stripe strategy
│   │   │   └── strategy.factory.ts        # Strategy factory
│   │   └── workers/             # Background workers
│   │       └── payment-timeout-worker.module.ts # Worker module
│   ├── presentation/            # Presentation layer
│   │   ├── grpc/                # gRPC controllers
│   │   │   └── payment.controller.ts # Payment gRPC endpoints
│   │   ├── http/                # HTTP controllers
│   │   │   └── webhook.controller.ts # Webhook endpoints
│   │   └── kafka/               # Kafka event handlers
│   │       └── kafka.controller.ts # Kafka event processing
│   └── shared/                  # Shared utilities
│       ├── event-topics/        # Event topic definitions
│       │   └── index.ts         # Topic constants
│       └── utils/               # Utility functions
│           ├── get-metadata.ts  # Metadata extraction
│           └── mapProviderToDomain.ts # Provider mapping
├── test/                        # Test files
│   ├── app.e2e-spec.ts          # End-to-end tests
│   ├── e2e/                     # E2E test specs
│   │   ├── payment.controller.e2e.spec.ts # Controller E2E tests
│   │   │   └── webhook.controller.e2e.spec.ts # Webhook E2E tests
│   ├── jest-e2e.json            # E2E test configuration
│   ├── setup.ts                 # Test setup
│   └── unit/                    # Unit tests
│       ├── application/         # Application layer tests
│       ├── domain/              # Domain layer tests
│       └── infrastructure/      # Infrastructure layer tests
├── proto/                       # Protocol buffer definitions
│   ├── payment_service.proto    # Payment service API
│   ├── payment/                 # Payment-related protobufs
│   │   ├── common.proto         # Shared types
│   │   └── types/               # Payment-specific types
│   ├── course_service.proto     # Course service protobuf
│   ├── order_service.proto      # Order service protobuf
│   └── user_service.proto       # User service protobuf
├── dist/                        # Compiled output
├── logs/                        # Application logs
├── node_modules/                # Dependencies
├── coverage/                    # Test coverage reports
├── Dockerfile                   # Docker configuration
├── docker-compose.yaml          # Docker compose for development
├── nest-cli.json                # NestJS CLI configuration
├── package.json                 # Node.js dependencies
├── tsconfig.json                # TypeScript configuration
├── tsconfig.build.json          # Build TypeScript config
├── env.example                  # Environment variables template
├── prometheus.yaml              # Prometheus configuration
├── LICENSE                      # License
└── README.md                    # Service documentation
```

## Key Features

### Payment Provider Support

- **Stripe**: Full checkout session support, payment intents
- **PayPal**: Order creation, capture, and approval flows
- **Razorpay**: Order creation, payment capture, signature verification

### Payment Lifecycle

**Status Flow**:
```
PENDING → RESOLVED → SUCCESS/FAILED
PENDING → CANCELLED
PENDING → EXPIRED
```

### Idempotency

- All payment operations support idempotency keys
- Duplicate requests return existing payment without side effects
- Webhook events are deduplicated using provider event IDs

### Timeout Management

- Default payment timeout: 10 minutes
- Automatic expiration via Redis TTL
- Scheduled sweeper as safety net (runs every minute)
- Payment timeout triggers order cancellation events

### Security

- Webhook signature verification for all providers
- JWT authentication for gRPC endpoints
- Role-based authorization
- Secure API key storage (environment variables)

## Service Boundaries

### Owns Data For

- **Payments**: Payment records with lifecycle state
- **PaymentProviderSession**: Provider-specific session data
- **PaymentProviderRefund**: Provider refund records
- **Refunds**: Refund aggregate records
- **Transaction**: Transaction history (if needed)

### Depends On

- **Order Service** (via gRPC): 
  - Order validation before payment creation
  - Order status updates after payment
- **Course Service** (via gRPC): 
  - Course validation for order items
- **Payment Providers**: 
  - Stripe API
  - PayPal API
  - Razorpay API
- **Database**: PostgreSQL for persistence
- **Redis**: 
  - Idempotency keys
  - Payment timeout tracking
  - Exchange rate caching
- **Kafka**: Event publishing and consumption

## Technical Stack

- **Framework**: NestJS 11.x
- **Language**: TypeScript 5.x
- **Database**: PostgreSQL 15+ with TypeORM
- **Cache**: Redis 7+ with ioredis
- **Messaging**: Kafka 3+ with Avro schemas
- **RPC**: gRPC with Protocol Buffers
- **Payment SDKs**: 
  - Stripe Node.js SDK
  - PayPal Server SDK
  - Razorpay Node.js SDK
- **Observability**: 
  - Prometheus for metrics
  - OpenTelemetry for tracing
  - Winston for logging

## Key Entities

### Domain Entities

- **Payment**: Aggregate root for payment operations
- **PaymentProviderSession**: Provider-specific payment session
- **Refund**: Refund aggregate root
- **PaymentProviderRefund**: Provider-specific refund data
- **Transaction**: Transaction history (optional)

### Value Objects

- **Money**: Amount and currency with validation
- **IdempotencyKey**: UUID-based idempotency key

## Performance Characteristics

- **Write-Heavy Workload**: Payment creation and status updates
- **Read Patterns**: Payment status checks, webhook processing
- **Caching Strategy**: 
  - Payment data cached for fast retrieval
  - Exchange rates cached with TTL
  - Idempotency keys cached in Redis
- **Timeout Handling**: 
  - Redis-based TTL for automatic expiration
  - Scheduled sweeper for safety net
  - Distributed locking to prevent race conditions

## Security Considerations

- **Webhook Security**: Signature verification for all providers
- **API Key Management**: Environment-based configuration
- **Idempotency**: Prevents duplicate payments
- **Audit Trail**: All payment operations logged
- **PCI Compliance**: No card data stored (handled by providers)

