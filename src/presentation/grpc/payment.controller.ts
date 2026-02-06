import {
  Controller,
  UseFilters,
  // UseGuards,
  UseInterceptors,
  UsePipes,
} from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { CreatePaymentUseCase } from '@application/use-cases/payments/create-payment.use-case';
// import { GrpcJwtAuthGuard } from '@infrastructure/auth/grpc-jwt-auth.guard';
import { Roles } from '@infrastructure/auth/roles.decorator';
// import { RoleGuard } from '@infrastructure/auth/role.auth';
import {
  CancelPaymentResponse,
  CreatePaymentResponse,
  CreatePaymentSuccess,
  HealthCheckRequest,
  HealthCheckResponse,
  ResolvePaymentResponse,
} from '../../infrastructure/grpc/generated/payment_service';
// import { ProcessRefundUseCase } from '@application/use-cases/refunds/process-refund.use-case';
import { LoggingInterceptor } from '../../infrastructure/grpc/interceptors/logging.interceptor';
import { MetricsInterceptor } from '../../infrastructure/grpc/interceptors/metrics.interceptor';
import { TracingInterceptor } from '../../infrastructure/grpc/interceptors/tracing.interceptor';
import { GrpcExceptionFilter } from '@infrastructure/filters/grpc-exception.filter';
import { Metadata } from '@grpc/grpc-js';
import { Error as ErrorResponse } from '@infrastructure/grpc/generated/payment_service';
import { ResolvePaymentDto } from './dtos/resolve-payment.dto';
// import { ResolveRazorpayPaymentDto } from './dtos/razorpay-verify-payment.dto';
import { GrpcValidationPipe } from '@infrastructure/pipe/grpc-validation.pipe';
import { PaymentCreateDto } from './dtos/create-payment.dto';
import { getMetadataValues } from 'src/shared/utils/get-metadata';
import { IdempotencyException } from '@domain/exceptions/domain.exceptions';
import { ResolvePaymentUseCase } from '@application/use-cases/payments/resolve-payment.use-case';
import { mapPaymentProviderToProvider } from 'src/shared/utils/mapProviderToDomain';
import { PaymentProvider } from '@domain/entities/payments';
import {
  PaypalSession,
  RazorpaySession,
  StripeSession,
} from '@application/adaptors/payment-strategy.interface';
import { CancelPaymentDto } from './dtos/cancel-payment.dto';
import { CancelPaymentUseCase } from '@application/use-cases/payments/cancel-payment.use-case';

@Controller()
@UseFilters(GrpcExceptionFilter)
// @UseGuards(GrpcJwtAuthGuard, RoleGuard)
@UseInterceptors(LoggingInterceptor, MetricsInterceptor, TracingInterceptor)
export class PaymentController {
  constructor(
    private readonly createPaymentUseCase: CreatePaymentUseCase,
    private readonly cancelPaymentUseCase: CancelPaymentUseCase,
    private readonly resolvePaymentUseCase: ResolvePaymentUseCase,
    // private readonly processRefundUseCase: ProcessRefundUseCase,
  ) {}

  private createErrorResponse(error: Error): ErrorResponse {
    return {
      code: error.name,
      message: error.message,
      details: [{ message: error.message, field: 'service' }],
    };
  }

  @GrpcMethod('PaymentService', 'CreatePayment')
  @UsePipes(GrpcValidationPipe)
  @Roles('user', 'admin')
  async createPayment(
    request: PaymentCreateDto,
  ): Promise<CreatePaymentResponse> {
    try {
      const response = await this.createPaymentUseCase.execute(request);
      return {
        success: this.mapToResponse(response),
      };
    } catch (e: any) {
      if (e instanceof Error) {
        return {
          error: this.createErrorResponse(e),
        };
      }
      throw e;
    }
  }
  @GrpcMethod('PaymentService', 'ResolvePayment')
  async resolvePayment(
    request: ResolvePaymentDto,
    metadata: Metadata,
  ): Promise<ResolvePaymentResponse> {
    const { idempotencyKey } = getMetadataValues(metadata, {
      idempotencyKey: 'idempotency-key',
    });
    if (!idempotencyKey) {
      throw new IdempotencyException('Idempotency Key is missing');
    }

    try {
      const response = await this.resolvePaymentUseCase.execute(
        request,
        idempotencyKey.toString(),
      );
      return {
        success: {
          paymentId: response.paymentId,
          orderId: response.orderId,
          status: response.providerStatus,
          isResolved: response.isVerified,
        },
      };
    } catch (e: any) {
      if (e instanceof Error) {
        return {
          error: this.createErrorResponse(e),
        };
      }
      throw e;
    }
  }
  @GrpcMethod('PaymentService', 'CancelPayment')
  async cancelPayment(
    request: CancelPaymentDto,
    metadata: Metadata,
  ): Promise<CancelPaymentResponse> {
    //

    const { idempotencyKey } = getMetadataValues(metadata, {
      idempotencyKey: 'idempotency-key',
    });
    if (!idempotencyKey) {
      throw new IdempotencyException('Idempotency Key is missing');
    }

    try {
      const response = await this.cancelPaymentUseCase.execute(
        request,
        idempotencyKey.toString(),
      );
      return {
        success: {
          paymentId: response.paymentId,
          providerOrderId: response.providerOrderId!,
          status: response.status,
        },
      };
    } catch (e: any) {
      if (e instanceof Error) {
        return {
          error: this.createErrorResponse(e),
        };
      }
      throw e;
    }
  }

  @GrpcMethod('PaymentService', 'HealthCheck')
  async healthCheck(
    _request: HealthCheckRequest,
  ): Promise<HealthCheckResponse> {
    return { status: 'HEALTHY' };
  }

  private mapToResponse(
    result: Awaited<ReturnType<CreatePaymentUseCase['execute']>>,
  ): CreatePaymentSuccess {
    return {
      provider: mapPaymentProviderToProvider(result.provider),
      paymentId: result.paymentId,
      status: result.status,
      orderId: result.orderId,

      ...(result.provider === PaymentProvider.PAYPAL
        ? {
            paypal: {
              approvalLink: (result.session as PaypalSession).approvalLink,
              orderId: (result.session as PaypalSession).orderId,
              amount: (result.session as PaypalSession).providerAmount,
              currency: (result.session as PaypalSession).providerCurrency,
            },
          }
        : result.provider === PaymentProvider.STRIPE
          ? {
              stripe: {
                publicKey: (result.session as StripeSession).publicKey,
                sessionId: (result.session as StripeSession).sessionId,
                url: (result.session as StripeSession).url,
                amount: (result.session as PaypalSession).providerAmount,
                currency: (result.session as PaypalSession).providerCurrency,
              },
            }
          : result.provider === PaymentProvider.RAZORPAY && {
              razorpay: {
                orderId: (result.session as RazorpaySession).orderId,
                currency: (result.session as RazorpaySession).currency,
                amount: (result.session as RazorpaySession).amount,
                keyId: (result.session as RazorpaySession).keyId,
              },
            }),
    };
  }
}
