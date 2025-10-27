import {
  Inject,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { LoggingService } from 'src/infrastructure/observability/logging/logging.service';
import { GRPC_ORDER_CLIENT_TOKEN } from './constants';
import { OrderServiceClient } from '@infrastructure/grpc/generated/order_service';
import { Metadata } from '@grpc/grpc-js';

@Injectable()
export class OrderClient implements OnModuleDestroy, OnModuleInit {
  private orderService!: OrderServiceClient;

  constructor(
    @Inject(GRPC_ORDER_CLIENT_TOKEN) private client: ClientGrpc,
    private readonly logger: LoggingService,
  ) {}

  onModuleInit() {
    this.orderService =
      this.client.getService<OrderServiceClient>('OrderService');
    this.logger.info('Order gRPC client initialized');
  }

  onModuleDestroy() {
    this.orderService.close();
    this.logger.info('Order gRPC client destroyed');
  }

  async getOrder(
    orderId: string,
    userId: string,
    metadata: Metadata = new Metadata(),
  ): Promise<{
    id: string;
    items: { courseId: string; price: number; currency: string }[];
  }> {
    return new Promise((resolve, reject) => {
      this.orderService.getOrderById(
        { orderId: orderId, userId },
        metadata,
        (error, response) => {
          this.logger.info(`Executing fetch order by userId ${userId}`);
          if (error) {
            this.logger.error(
              `Failed to fetch order ${orderId}: ${error.message}`,
              {
                error,
              },
            );
            reject(error);
          }
          if (response.error) {
            throw new Error(response.error.message);
          }
          const { order } = response.success ?? {};

          this.logger.debug(`Fetched order ${orderId} via gRPC`);
          resolve({
            id: order!.id,
            items: order!.items.map((item) => ({
              courseId: item.courseId,
              price: item.price,
              currency: order!.amount!.currency,
            })),
          });
        },
      );
    });
  }
}
