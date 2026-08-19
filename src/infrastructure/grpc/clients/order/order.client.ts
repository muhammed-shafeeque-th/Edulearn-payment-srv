import {
  Inject,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { GRPC_ORDER_CLIENT_TOKEN } from './constants';
import {
  OrderData,
  OrderResponse,
  OrderServiceClient,
} from '@infrastructure/grpc/generated/order_service';

import { ICacheService } from '@application/ports/redis.interface';
import {
  ClientServiceException,
  OrderNotFoundException,
} from '@domain/exceptions/domain.exceptions';
import { ILoggerService } from '@application/ports/logger.service';
import {
  IOrderClient,
  OrderStatus,
} from '@application/ports/order-client.interface';

export type OrderDetails = {
    id: string;
    amount: number;
    currency: string;
    status: OrderStatus;
    discount: number;
    salesTax?: number;
    items: { courseId: string; price: number; currency: string }[];
  }

@Injectable()
export class OrderClient
  implements IOrderClient, OnModuleDestroy, OnModuleInit
{
  private orderService!: OrderServiceClient;

  constructor(
    @Inject(GRPC_ORDER_CLIENT_TOKEN) private client: ClientGrpc,
    private readonly _logger: ILoggerService,
    private readonly _redisClient: ICacheService,
  ) {}

  onModuleInit() {
    this.orderService =
      this.client.getService<OrderServiceClient>('OrderService');
    this._logger.info('Order gRPC client initialized');
  }

  onModuleDestroy() {
    this._logger.info('Order gRPC client destroyed');
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

    const cacheResult = await this._redisClient.get<OrderDetails>(cacheKey);
    if (cacheResult) {
      cacheResult;
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

            this._logger.debug(`Fetched order ${orderId} via gRPC`);
            resolve(response.success.order);
          },
          error: (error: any) => {
            this._logger.error(
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

      await this._redisClient.set(
        cacheKey,
        orderData,
        CACHE_TTL,
      );

      return orderData;
    } catch (err) {
      this._logger.error('Error fetching order GRPC', { err });
      throw err;
    }
  }
}
