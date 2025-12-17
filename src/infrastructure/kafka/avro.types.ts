import * as avsc from 'avsc';
import * as fs from 'fs';
import * as path from 'path';

// Load Avro schemas
export const PaymentEventSchema = avsc.Type.forSchema(
  JSON.parse(
    fs.readFileSync(
      path.join(
        __dirname,
        '..',
        '..',
        '..',
        'src',
        'infrastructure',
        'kafka',
        'avro-schemas',
        'payment-event.avsc',
      ),
      'utf-8',
    ),
  ),
);

export const RefundEventSchema = avsc.Type.forSchema(
  JSON.parse(
    fs.readFileSync(
      path.join(
        __dirname,
        '..',
        '..',
        '..',
        'src',
        'infrastructure',
        'kafka',
        'avro-schemas',
        'refund-event.avsc',
      ),
      'utf-8',
    ),
  ),
);

// Now define typescript schemas (as avro does not generate itself)
export interface Money {
  amount: number;
  currency: string;
}

export interface PaymentEvent {
  payment_id: string;
  user_id: string;
  order_id: string;
  amount: Money;
  status: string;
  transaction_id: string | null;
  event_type: string;
  timestamp: number;
  error: string | null;
}

export interface RefundEvent {
  refund_id: string;
  payment_id: string;
  user_id: string;
  amount: Money;
  status: string;
  transaction_id: string | null;
  reason: string;
  event_type: string;
  timestamp: number;
  error: string | null;
}
