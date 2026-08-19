import { IdempotencyKey } from '@domain/value-objects/idempotency-key';

export abstract class IIdempotencyService {
  abstract check<T>(
    idempotencyKey: IdempotencyKey,
    callback: () => Promise<T>,
  ): Promise<T>;
}
