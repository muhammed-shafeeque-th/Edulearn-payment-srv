import {
  Controller,
  UseFilters,
  // UseGuards,
  UseInterceptors,
  UsePipes,
} from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { Roles } from '@infrastructure/auth/roles.decorator';
import {
  CancelPaymentResponse,
  CreatePaymentResponse,
  CreateProviderSessionResponse,
  HealthCheckRequest,
  HealthCheckResponse,
  ResolvePaymentResponse,
} from '../../infrastructure/grpc/generated/payment_service';
import { LoggingInterceptor } from '../../infrastructure/grpc/interceptors/logging.interceptor';
import { MetricsInterceptor } from '../../infrastructure/grpc/interceptors/metrics.interceptor';
import { TracingInterceptor } from '../../infrastructure/grpc/interceptors/tracing.interceptor';
import { GrpcExceptionFilter } from '@infrastructure/filters/grpc-exception.filter';
import { Metadata } from '@grpc/grpc-js';
// import { Error as ErrorResponse } from '@infrastructure/grpc/generated/payment_service';
import { ResolvePaymentDto } from './dtos/resolve-payment.dto';
import { GrpcValidationPipe } from '@infrastructure/pipe/grpc-validation.pipe';
import {
  PaymentCreateDto,
  CreateProviderSessionDto,
} from './dtos/create-payment.dto';
import { getMetadataValues } from 'src/shared/utils/get-metadata';
import { IdempotencyException } from '@domain/exceptions/domain.exceptions';
import { mapPaymentProviderToProvider } from 'src/shared/utils/mapProviderToDomain';
import { PaymentProvider } from '@domain/entities/payments';
import {
  PaypalSession,
  RazorpaySession,
  StripeSession,
} from '@application/ports/payment-gateway-strategy.interface';
import { CancelPaymentDto } from './dtos/cancel-payment.dto';
import { ICreatePaymentUseCase } from '@application/use-cases/payments/interfaces/create-payment.interface';
import { ICreateProviderSessionUseCase } from '@application/use-cases/payments/interfaces/create-provider-session.interface';
import { ICancelPaymentUseCase } from '@application/use-cases/payments/interfaces/cancel-payment.interface';
import { IResolvePaymentUseCase } from '@application/use-cases/payments/interfaces/resolve-payment.inteface';

@Controller()
@UseFilters(GrpcExceptionFilter)
// @UseGuards(GrpcJwtAuthGuard, RoleGuard)
@UseInterceptors(LoggingInterceptor, MetricsInterceptor, TracingInterceptor)
export class PaymentController {
  constructor(
    private readonly _createPaymentUseCase: ICreatePaymentUseCase,
    private readonly _createProviderSessionUseCase: ICreateProviderSessionUseCase,
    private readonly _cancelPaymentUseCase: ICancelPaymentUseCase,
    private readonly _resolvePaymentUseCase: IResolvePaymentUseCase,
    // private readonly processRefundUseCase: ProcessRefundUseCase,
  ) {}

  @GrpcMethod('PaymentService', 'CreatePayment')
  @UsePipes(GrpcValidationPipe)
  @Roles('student', 'instructor')
  async createPayment(
    request: PaymentCreateDto,
  ): Promise<CreatePaymentResponse> {
    console.log(
      'Create Payment Request Recieved : ' + JSON.stringify(request, null, 2),
    );
    const response = await this._createPaymentUseCase.execute(request);
    console.log(
      'Create Payment response : ' + JSON.stringify(response, null, 2),
    );
    return {
      success: {
        paymentId: response.paymentId,
        status: response.status,
        orderId: response.orderId,
      },
    };
  }
  @GrpcMethod('PaymentService', 'CreateProviderSession')
  @UsePipes(GrpcValidationPipe)
  @Roles('student', 'instructor')
  async createProviderSession(
    request: CreateProviderSessionDto,
  ): Promise<CreateProviderSessionResponse> {
    const response = await this._createProviderSessionUseCase.execute(request);
    return {
      success: {
        paymentId: response.paymentId,
        provider: mapPaymentProviderToProvider(response.provider),
        ...this.mapProviderSession(response.provider, response.session),
      },
    };
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

    const response = await this._resolvePaymentUseCase.execute(
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
  }

  @GrpcMethod('PaymentService', 'CancelPayment')
  async cancelPayment(
    request: CancelPaymentDto,
    metadata: Metadata,
  ): Promise<CancelPaymentResponse> {
    const { idempotencyKey } = getMetadataValues(metadata, {
      idempotencyKey: 'idempotency-key',
    });
    if (!idempotencyKey) {
      throw new IdempotencyException('Idempotency Key is missing');
    }

    const response = await this._cancelPaymentUseCase.execute(
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
  }

  @GrpcMethod('PaymentService', 'HealthCheck')
  async healthCheck(
    _request: HealthCheckRequest,
  ): Promise<HealthCheckResponse> {
    return { status: 'HEALTHY' };
  }

  private mapProviderSession(provider: number | string, session: any) {
    // Determine the payment provider domain enum
    const paymentProvider =
      typeof provider === 'number'
        ? provider === 1
          ? PaymentProvider.STRIPE
          : provider === 2
            ? PaymentProvider.RAZORPAY
            : PaymentProvider.PAYPAL
        : provider;

    if (paymentProvider === PaymentProvider.PAYPAL) {
      return {
        paypal: {
          approvalLink: (session as PaypalSession).approvalLink,
          orderId: (session as PaypalSession).orderId,
          amount: (session as PaypalSession).providerAmount,
          currency: (session as PaypalSession).providerCurrency,
        },
      };
    } else if (paymentProvider === PaymentProvider.STRIPE) {
      return {
        stripe: {
          publicKey: (session as StripeSession).publicKey,
          sessionId: (session as StripeSession).sessionId,
          url: (session as StripeSession).url,
          amount: (session as StripeSession).providerAmount,
          currency: (session as StripeSession).providerCurrency,
        },
      };
    } else if (paymentProvider === PaymentProvider.RAZORPAY) {
      return {
        razorpay: {
          orderId: (session as RazorpaySession).orderId,
          currency: (session as RazorpaySession).currency,
          amount: (session as RazorpaySession).amount,
          keyId: (session as RazorpaySession).keyId,
        },
      };
    }
    return {};
  }
}
