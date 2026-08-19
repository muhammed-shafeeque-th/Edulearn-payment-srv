import { LoggerService as Logger } from '@edulearn/nest';
import { Injectable } from '@nestjs/common';
import { ILoggerService, LogContext } from '@application/ports/logger.service';

@Injectable()
export class LoggerService implements ILoggerService {
  public constructor(private readonly logger: Logger) {}

  info(message: string, context?: LogContext): void {
    this.logger.info(message, context);
  }

  log(message: string, context?: LogContext): void {
    this.logger.info(message, context);
  }

  error(message: string, context?: LogContext): void {
    this.logger.error(message, context);
  }

  warn(message: string, context?: LogContext): void {
    // Renamed from warning to warn for consistency with Winston
    this.logger.warn(message, context);
  }

  debug(message: string, context?: LogContext): void {
    this.logger.debug(message, context);
  }
}
