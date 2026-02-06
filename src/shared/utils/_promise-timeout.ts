import { TimeoutException } from '@domain/exceptions/domain.exceptions';

export async function timeoutPromise<T>(
  callback: () => Promise<T>,
  message: string = 'Promise callback timed out',
  timeout: number = 10000,
): Promise<T> {
  const result = await Promise.race([
    callback(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new TimeoutException(message)), timeout),
    ),
  ]);
  return result;
}
