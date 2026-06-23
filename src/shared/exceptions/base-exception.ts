import { ErrorCode } from "./error-codes";

export abstract class BaseException extends Error {
  constructor(
    public readonly code: ErrorCode,
    public readonly message: string,
    public readonly reason?: string,
    public readonly metadata?: Record<string, any>,
  ) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
