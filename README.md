# Payment Service

> Payment orchestration and transaction processing service for the EduLearn platform.

![Payment Service Banner](docs/images/banner.png)

## Overview

The Payment Service manages payment processing across the EduLearn platform. It acts as the central payment orchestration layer responsible for initiating, validating, processing, and tracking payments made for courses, subscriptions, and future platform offerings.

The service follows Clean Architecture principles and uses a provider-agnostic payment abstraction powered by the Strategy Pattern, enabling seamless integration with multiple payment gateways while keeping business logic isolated from provider-specific implementations.

The Payment Service is designed for reliability, security, observability, and idempotent payment execution within a distributed microservices environment.

---

## Responsibilities

### Payment Processing

* Payment initialization
* Payment verification
* Payment confirmation
* Payment failure handling
* Refund processing
* Payment reconciliation

### Provider Management

* Stripe integration
* Razorpay integration
* Provider abstraction layer
* Strategy-based provider selection

### Transaction Management

* Transaction lifecycle management
* Transaction status tracking
* Audit trail maintenance
* Retry handling

### Event-Driven Processing

* Payment events publishing
* Payment events consumption
* Order workflow integration
* Notification triggering

### Reliability

* Redis-backed idempotency
* Duplicate payment prevention
* Retry-safe operations
* Distributed transaction support

---

## Service Boundaries

### Owns

* Payments
* Transactions
* Payment attempts
* Provider references
* Refund records
* Payment audit logs

### Depends On

| Service              | Purpose                          |
| -------------------- | -------------------------------- |
| Order Service        | Order validation and fulfillment |
| User Service         | User validation                  |
| Notification Service | Payment notifications            |
| Kafka                | Event communication              |
| Redis                | Idempotency and caching          |
| PostgreSQL           | Persistent storage               |

---

## Architecture

### Architectural Style

* Clean Architecture
* Domain-Driven Design
* Event-Driven Architecture
* Strategy Pattern
* Repository Pattern
* Dependency Injection

### Layers

```text
Presentation Layer
        │
        ▼
Application Layer
        │
        ▼
Domain Layer
        │
        ▼
Infrastructure Layer
```

---

## Technology Stack

| Category         | Technology    |
| ---------------- | ------------- |
| Language         | TypeScript    |
| Framework        | NestJS        |
| Runtime          | Node.js       |
| Communication    | gRPC          |
| Messaging        | Kafka         |
| Cache            | Redis         |
| Database         | PostgreSQL    |
| ORM              | TypeORM       |
| Payments         | Stripe        |
| Payments         | Razorpay      |
| Logging          | Winston       |
| Metrics          | Prometheus    |
| Tracing          | OpenTelemetry |
| Containerization | Docker        |
| Orchestration    | Kubernetes    |

---

## Payment Architecture

### Strategy Pattern

The service uses the Strategy Pattern to support multiple payment providers.

```text
Payment Strategy
│
├── Stripe Strategy
│
└── Razorpay Strategy
```

This enables:

* Easy addition of new providers
* Provider isolation
* Consistent payment APIs
* Simplified testing

---

## Core Domain Models

### Payment

Represents a payment transaction initiated by a user.

### PaymentProvider

Provider-specific metadata and references.


### Refund

Represents refunded transactions.


---

## Communication

### gRPC

The service exposes internal APIs through gRPC.

Examples:

* CreatePayment
* VerifyPayment
* RefundPayment
* GetPaymentStatus
* GetTransactionHistory

---

### Kafka Events

#### Published Events

```text
payment.created.v1
payment.processing.v1
payment.succeeded.v1
payment.failed.v1
payment.refunded.v1
payment.cancelled.v1
```

#### Consumed Events

```text
order.created.v1
order.cancelled.v1
order.expired.v1
```

---

## Payment Flow

### Successful Payment

```text
User
 │
 ▼
Client
 │
 ▼
API Gateway
 │
 ▼
Order Service
 │
 ▼
Payment Service
 │
 ▼
Payment Provider
 │
 ▼
Payment Success
 │
 ▼
Kafka Event
 │
 ▼
Order Service
 │
 ▼
Order Completed
```

---

## Idempotency

To prevent duplicate charges, the service uses Redis-backed idempotency keys.

Features:

* Duplicate request detection
* Safe retries
* Payment replay protection
* Transaction consistency

---

## Database

### PostgreSQL

Used for:

* Payments
* Transactions
* Refunds
* Audit records
* Provider references

### TypeORM

Responsibilities:

* Entity mapping
* Repository implementation
* Query abstraction
* Migration management

---

## Redis

Used for:

* Idempotency keys
* Request deduplication
* Payment session caching
* Distributed locking

---

## Observability

The Payment Service integrates with the platform-wide observability stack.

### Logging

Implemented using Winston.

Features:

* Structured JSON logs
* Correlation IDs
* Trace context propagation
* Centralized log aggregation

Pipeline:

```text
Application
    │
    ▼
Winston
    │
    ▼
Fluent bit
    │
    ▼
OTEL Collector
    │
    ▼
Loki
    │
    ▼
Grafana
```

---

### Metrics

Prometheus metrics include:

* Payment success rate
* Payment failure rate
* Refund count
* Provider latency
* Transaction volume
* Kafka processing metrics

Pipeline:

```text
Application
    │
    ▼
Prometheus
    │
    ▼
Grafana
```

---

### Distributed Tracing

Implemented using OpenTelemetry.

Tracked operations:

* Payment initialization
* Provider requests
* Kafka publishing
* Database transactions
* Redis operations

Pipeline:

```text
Application
    │
    ▼
OTEL Collector
    │
    ▼
Tempo
    │
    ▼
Grafana
```

---

## Security

### Payment Security

* Secure payment verification
* Webhook validation
* Signature verification
* Request integrity checks

### Application Security

* Non-root containers
* Read-only runtime filesystem
* Secret Manager integration
* Secure service-to-service communication

### Infrastructure Security

* Private EKS cluster
* Pod Identity Agent
* Least privilege IAM
* No static cloud credentials

---

## Deployment

The service is deployed on Amazon EKS through GitOps workflows.

### Deployment Components

* Helm Chart
* ArgoCD
* ArgoCD Image Updater
* External Secrets
* AWS Load Balancer Controller

---

## CI/CD

### Continuous Integration

```text
GitHub Push
     │
     ▼
GitHub Actions
     │
     ├── Lint
     ├── Test
     ├── Build
     ├── Security Scan
     └── Container Build
     │
     ▼
GHCR
```

### Continuous Deployment

```text
GHCR
 │
 ▼
ArgoCD Image Updater
 │
 ▼
Git Repository Update
 │
 ▼
ArgoCD Sync
 │
 ▼
Amazon EKS
```

---

## Container Optimization

The service uses optimized multi-stage Docker builds.

Optimizations include:

* Build/runtime separation
* Dependency pruning
* Minimal runtime image
* Non-root execution
* Layer caching

Benefits:

* Faster deployments
* Reduced attack surface
* Lower registry storage
* Faster startup times

---

## Local Development

### Install Dependencies

```bash
yarn install
```

### Run Development Server

```bash
yarn dev
```

### Run Tests

```bash
yarn test
```

### Build

```bash
yarn build
```

---

## Environment Variables

```env
DATABASE_URL=
REDIS_URL=

KAFKA_BROKERS=

STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=

RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=

OTEL_EXPORTER_OTLP_ENDPOINT=

JWT_SECRET=
```

---

# Related Repositories

| Repository                    | Description                                                   |
| ----------------------------- | ------------------------------------------------------------- |
| [edulearn-platform](https://github.com/muhammed-shafeeque-th/edulearn-platform)             | Platform orchestration repository                             |
| [edulearn-api-gateway](https://github.com/muhammed-shafeeque-th/edulearn-api-gateawy)          | API Gateway                                                   |
| [edulearn-user-service](https://github.com/muhammed-shafeeque-th/edulearn-user-srv)         | User profile service                                          |
| [edulearn-course-service](https://github.com/muhammed-shafeeque-th/edulearn-course-srv)       | Course management service                                     |
| [edulearn-auth-service](https://github.com/muhammed-shafeeque-th/edulearn-auth-srv)      | Authentication service                                    |
| [edulearn-order-service](https://github.com/muhammed-shafeeque-th/edulearn-order-srv)        | Order management service                                      |
| [edulearn-notification-service](https://github.com/muhammed-shafeeque-th/edulearn-notification-srv) | Notification service                                          |
| [edulearn-auth-service](https://github.com/muhammed-shafeeque-th/edulearn-auth-srv)         | Authentication service                                        |
| [@edulearn/core](https://github.com/muhammed-shafeeque-th/edulearn-core)                | Shared logging, metrics, tracing, Redis, Kafka, health checks |
| [@edulearn/nest](https://github.com/muhammed-shafeeque-th/edulearn-nest)                | Shared NestJS infrastructure package                          |

---

## Documentation

Additional documentation is available under:

```text
docs/
├── architecture.md
├── payment-flow.md
├── provider-integration.md
├── deployment.md
├── observability.md
├── security.md
└── api-reference.md
```

---

## License

Licensed under the MIT License.
