import {
  Inject,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { LoggingService } from 'src/infrastructure/observability/logging/logging.service';
import { GRPC_ORDER_CLIENT_TOKEN } from './constants';
import {
  OrderData,
  OrderResponse,
  OrderServiceClient,
} from '@infrastructure/grpc/generated/order_service';

import { ICacheService } from '@application/adaptors/redis.interface';
import {
  ClientServiceException,
  OrderNotFoundException,
} from '@domain/exceptions/domain.exceptions';

export type OrderStatus =
  | 'created'
  | 'pending_payment'
  | 'processing'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'refunded'
  | 'expired';

@Injectable()
export class OrderClient implements OnModuleDestroy, OnModuleInit {
  private orderService!: OrderServiceClient;

  constructor(
    @Inject(GRPC_ORDER_CLIENT_TOKEN) private client: ClientGrpc,
    private readonly logger: LoggingService,
    private readonly redisClient: ICacheService,
  ) {}

  onModuleInit() {
    this.orderService =
      this.client.getService<OrderServiceClient>('OrderService');
    this.logger.info('Order gRPC client initialized');
  }

  onModuleDestroy() {
    this.logger.info('Order gRPC client destroyed');
  }

  async getOrder(
    orderId: string,
    userId: string,
  ): Promise<{
    id: string;
    amount: number;
    currency: string;
    status: OrderStatus;
    discount: number;
    salesTax?: number;
    items: { courseId: string; price: number; currency: string }[];
  }> {
    const CACHE_TTL = 10 * 60;
    const cacheKey = `order_details:${orderId}`;

    const cacheResult = await this.redisClient.get(cacheKey);
    if (cacheResult) {
      return JSON.parse(cacheResult);
    }

    try {
      const orderRes = await new Promise<OrderData>((resolve, reject) => {
        this.orderService.getOrderById({ orderId, userId }).subscribe({
          next: (response: OrderResponse) => {
            if (response.error) {
              throw new ClientServiceException(response.error.message);
            }

            if (!response.success?.order) {
              throw new OrderNotFoundException(
                `Order not found for Id ${orderId}`,
              );
            }

            this.logger.debug(`Fetched order ${orderId} via gRPC`);
            resolve(response.success.order);
          },
          error: (error: any) => {
            this.logger.error(
              `Failed to fetch order by id ${orderId}: ${error.message}`,
              { error },
            );
            reject(error);
          },
        });
      });

      const orderData = {
        id: orderRes.id,
        status: orderRes.status as OrderStatus,
        amount: orderRes.amount!.total,
        currency: orderRes.amount!.currency,
        salesTax: orderRes.amount!.salesTax,
        discount: orderRes.amount!.discount,
        items: orderRes.items.map((item) => ({
          courseId: item.courseId,
          price: item.price,
          currency: orderRes.amount!.currency,
        })),
      };

      await this.redisClient.set(
        cacheKey,
        JSON.stringify(orderData),
        CACHE_TTL,
      );

      return orderData;
    } catch (err) {
      this.logger.error('Error fetching order GRPC', { err });
      throw err;
    }
  }
}
