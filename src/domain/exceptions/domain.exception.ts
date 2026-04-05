import { BaseException } from 'src/shared/exceptions/base-exception';
import { ErrorCode } from 'src/shared/exceptions/error-codes';

export abstract class DomainException extends BaseException {
  constructor(
    code: ErrorCode,
    message: string,
    reason?: string,
    metadata?: Record<string, any>,
  ) {
    super(code, message, reason, metadata);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = this.constructor.name;
  }
}
