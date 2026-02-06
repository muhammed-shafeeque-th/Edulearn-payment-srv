import { TimeoutException } from '@domain/exceptions/domain.exceptions';

export function promiseTimeout<T>(
  callback: () => Promise<T>,
  message: string = 'Promise callback timed out',
  timeout: number = 10000,
): Promise<T> {
  let timer: NodeJS.Timeout;
  return new Promise<T>((resolve, reject) => {
    // Start the timeout timer
    timer = setTimeout(() => {
      reject(new TimeoutException(message));
    }, timeout);

    // Run the callback
    Promise.resolve()
      .then(callback)
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}
