export type OrderStatus =
  | 'created'
  | 'pending_payment'
  | 'processing'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'refunded'
  | 'expired';

export abstract class IOrderClient {
  abstract getOrder(
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
  }>;
}
