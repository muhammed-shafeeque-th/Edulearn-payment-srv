export abstract class ICacheService {
  abstract set(key: string, value: string, ttl?: number): Promise<void>;
  abstract get(key: string): Promise<string | null>;
  abstract del(key: string): Promise<void>;
  abstract exists(key: string): Promise<boolean>;
  abstract lock(key: string, ttl: number): Promise<boolean>;
  abstract unlock(key: string): Promise<void>;
  abstract delByPattern(pattern: string): Promise<void>;

  /**
   * Set an expiry/timeout specifically for a key, regardless of how it was set.
   * @param key - The key to expire
   * @param ttlSeconds - The time-to-live in seconds
   */
  abstract expire(key: string, ttlSeconds: number): Promise<boolean>;

  /**
   * Get the time-to-live of a key in seconds. Returns -1 if the key exists but has no expiry.
   * Returns -2 if the key does not exist.
   * @param key - The key to check
   */
  abstract getTTL(key: string): Promise<number>;
}
