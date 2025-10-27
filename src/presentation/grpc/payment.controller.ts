import {
  Controller,
  // IntrinsicException,
  UseFilters,
  // UseGuards,
  UseInterceptors,
  UsePipes,
} from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { CreatePaymentUseCase } from '@application/use-cases/payments/create-payment.use-case';
import { RefundCreateDto } from '@application/dtos/refund-create.dto';
// import { GrpcJwtAuthGuard } from '@infrastructure/auth/grpc-jwt-auth.guard';
import { Roles } from '@infrastructure/auth/roles.decorator';
// import { RoleGuard } from '@infrastructure/auth/role.auth';
import {
  CapturePaymentResponse,
  CreatePaymentResponse,
  CreatePaymentSuccess,
  HealthCheckRequest,
  HealthCheckResponse,
  ProcessRefundRequest,
  ProcessRefundResponse,
  RazorpayVerifyPaymentRequest,
  RazorpayVerifyResponse,
} from '../../infrastructure/grpc/generated/payment-service';
import { ProcessRefundUseCase } from '@application/use-cases/refunds/process-refund.use-case';
import { LoggingInterceptor } from '../../infrastructure/grpc/interceptors/logging.interceptor';
import { MetricsInterceptor } from '../../infrastructure/grpc/interceptors/metrics.interceptor';
import { TracingInterceptor } from '../../infrastructure/grpc/interceptors/tracing.interceptor';
import { GrpcExceptionFilter } from '@infrastructure/filters/grpc-exception.filter';
import { Metadata, MetadataValue } from '@grpc/grpc-js';
import { Error as ErrorResponse } from '@infrastructure/grpc/generated/payment-service';
import { CapturePaypalPaymentUseCase } from '@application/use-cases/payments/capture-paypal-payment.use-case';
import { CapturePaymentDto } from './dtos/capture-payment.dto';
// import { VerifyRazorpayPaymentDto } from './dtos/razorpay-verify-payment.dto';
import { VerifyRazorpayPaymentUseCase } from '@application/use-cases/payments/verify-razorpay-payment.use-case';
import { PaymentGateway } from '@domain/entities/payments';
import { GrpcValidationPipe } from '@infrastructure/pipe/grpc-validation.pipe';
import { PaymentCreateDto } from './dtos/create-payment.dto';
import { getMetadataValues } from 'src/shared/utils/get-metadata';
import { IdempotencyException } from '@domain/exceptions/domain.exceptions';

@Controller()
@UseFilters(GrpcExceptionFilter)
// @UseGuards(GrpcJwtAuthGuard, RoleGuard)
@UsePipes(GrpcValidationPipe)
@UseInterceptors(LoggingInterceptor, MetricsInterceptor, TracingInterceptor)
export class PaymentController {
  constructor(
    private readonly createPaymentUseCase: CreatePaymentUseCase,
    private readonly capturePaymentUseCase: CapturePaypalPaymentUseCase,
    private readonly verifyPaymentUseCase: VerifyRazorpayPaymentUseCase,
    private readonly processRefundUseCase: ProcessRefundUseCase,
  ) {}

  private createErrorResponse(error: Error): ErrorResponse {
    return {
      code: error.name,
      message: error.message,
      details: [{ message: error.message, field: 'service' }],
    };
  }

  @GrpcMethod('PaymentService', 'createPayment')
  @Roles('user', 'admin')
  async createPayment(
    request: PaymentCreateDto,
  ): Promise<CreatePaymentResponse> {
    console.log('Create dto', JSON.stringify(request, null, 2));
    // const dto = new PaymentCreateDto();
    // dto.userId = request.userId;
    // dto.orderId = request.orderId;
    // dto.amount = {
    //   amount: Number(request.amount?.amount || 0),
    //   currency: request.amount?.currency || 'USD',
    // };
    // dto.paymentGateway = request.paymentGateway as any;
    // dto.idempotencyKey = request.idempotencyKey;

    try {
      const response = await this.createPaymentUseCase.execute(request);
      return {
        success: this.mapToResponse(response),
        // paymentId: response.id,
        // userId: response.userId,
        // orderId: response.orderId,
        // amount: response.amount,
        // status: response.status,
        // transactionId: response.transactionId || '',
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
  @GrpcMethod('PaymentService', 'PayPalPaymentCapture')
  async payPalPaymentCapture(
    request: CapturePaymentDto,
    metadata: Metadata,
  ): Promise<CapturePaymentResponse> {
    // To retrieve a metadata value from the metadata object, use the get method.
    // For example, to get the 'Idempotency-key' value:
    const { idempotencyKey } = getMetadataValues(metadata, {
      idempotencyKey: 'idempotency-key',
    });
    if (!idempotencyKey) {
      throw new IdempotencyException('Idempotency Key is missing');
    }

    try {
      const response = await this.capturePaymentUseCase.execute(
        request,
        idempotencyKey.toString(),
      );
      return {
        success: {
          paymentId: request.paymentId,
          status: response.status,
          transactionId: response.transactionId,
          metadata: {},
          // paymentId: response.id,
          // userId: response.userId,
          // orderId: response.orderId,
          // amount: response.amount,
          // status: response.status,
          // transactionId: response.transactionId || '',
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
  @GrpcMethod('PaymentService', 'RazorpayVerifyPayment')
  async razorpayVerifyPayment(
    request: RazorpayVerifyPaymentRequest,
    metadata: Metadata,
  ): Promise<RazorpayVerifyResponse> {
    const idempotencyKey = (
      Array.isArray(metadata.get('idempotency-key'))
        ? metadata.get('idempotency-key')[0]
        : metadata.get('idempotency-key')
    ) as MetadataValue;

    console.log(JSON.stringify({ request, idempotencyKey }, null, 2));

    try {
      const response = await this.verifyPaymentUseCase.execute(
        request,
        idempotencyKey?.toString(),
      );
      return {
        success: {
          paymentId: request.paymentId,
          status: 'success',
          transactionId: response.orderId,
          metadata: {},
          // paymentId: response.id,
          // userId: response.userId,
          // orderId: response.orderId,
          // amount: response.amount,
          // status: response.status,
          // transactionId: response.transactionId || '',
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

  @GrpcMethod('PaymentService', 'ProcessRefund')
  @Roles('admin')
  async processRefund(
    request: ProcessRefundRequest,
  ): Promise<ProcessRefundResponse> {
    const dto = new RefundCreateDto();
    dto.paymentId = request.paymentId;
    dto.userId = request.userId;
    dto.amount = {
      amount: Number(request.amount?.amount || 0),
      currency: request.amount?.currency || 'USD',
    };
    dto.reason = request.reason;
    dto.idempotencyKey = request.idempotencyKey;

    try {
      const response = await this.processRefundUseCase.execute(dto);
      return {
        success: {
          refundId: response.id,
          paymentId: response.paymentId,
          userId: response.userId,
          amount: response.amount,
          status: response.status,
          transactionId: response.transactionId || '',
        },
      };
    } catch (e: any) {
      return {
        error: {
          code: e?.code || 'INTERNAL',
          message: e?.message || 'Failed to process refund',
          details: [
            {
              field: e?.field || 'service',
              message: e?.details || e?.message || String(e),
            },
          ],
        },
      };
    }
  }

  @GrpcMethod('PaymentService', 'HealthCheck')
  async healthCheck(
    _request: HealthCheckRequest,
  ): Promise<HealthCheckResponse> {
    // In a real implementation, check dependencies (DB, Kafka, Redis)
    return { status: 'HEALTHY' };
  }

  private mapToResponse(
    result: Awaited<ReturnType<CreatePaymentUseCase['execute']>>,
  ): CreatePaymentSuccess {
    return {
      ...(result.gateway === PaymentGateway.PAYPAL
        ? {
            paypal: {
              amount: result.amount,
              approvalUrl: result.paypal.redirectUrl,
              orderId: result.orderId,
              paymentId: result.paymentId,
              providerOrderId: result.paypal.providerOrderId,
              status: result.status,
              userId: result.userId,
            },
          }
        : result.gateway === PaymentGateway.STRIPE
          ? {
              stripe: {
                amount: result.amount,
                clientSecret: result.stripe.clientSecret,
                orderId: result.orderId,
                paymentId: result.paymentId,
                transactionId: result.stripe.paymentIntentId,
                status: result.status,
                userId: result.userId,
              },
            }
          : {
              razorpay: {
                amount: result.amount,
                providerOrderId: result.razorpay.providerOrderId,
                orderId: result.orderId,
                paymentId: result.paymentId,
                status: result.status,
                userId: result.userId,
                keyId: result.razorpay.keyId,
              },
            }),
    };
  }
}
