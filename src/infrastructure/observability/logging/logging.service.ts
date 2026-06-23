import { Inject, Injectable, LoggerService } from '@nestjs/common';
import { context, trace } from '@opentelemetry/api'; // Import OpenTelemetry context API
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { AppConfigService } from 'src/infrastructure/config/config.service';
import { Logger as WinstonLogger } from 'winston';

// Define a more robust LogContext interface
interface LogContext {
  traceId?: string; // OpenTelemetry Trace ID
  spanId?: string; // OpenTelemetry Span ID
  userId?: string; // Logged-in user ID
  correlationId?: string; // General correlation ID if different from traceId
  service?: string;
  environment?: string;
  ctx?: string; // Method or class in which logging
  // Allows arbitrary additional context properties
  [key: string]: unknown;
}

@Injectable()
export class LoggingService implements LoggerService {
  public constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: WinstonLogger,
    private readonly configService: AppConfigService,
  ) {}

  // Private helper to build common log entry structure
  private buildLogEntry(
    level: string,
    message: string,
    logContext?: LogContext,
  ) {
    // Get current active OpenTelemetry span context for correlation
    const activeSpan = trace.getSpan(context.active());
    const spanContext = activeSpan?.spanContext();

    return {
      level,
      message,
      // Prioritize traceId/spanId from active OpenTelemetry context
      traceId: spanContext?.traceId,
      spanId: spanContext?.spanId,
      // Fallback to context provided if not from active span
      userId: logContext?.userId,
      correlationId: logContext?.correlationId,
      service: logContext?.service || this.configService.serviceName,
      environment: this.configService.nodeEnv || 'development',
      caller: this.getCaller(),
      // Include any other custom context provided directly
      ...logContext,
    };
  }

  // Use winston's logger directly with metadata object
  info(message: string, context?: LogContext): void {
    const logEntry = this.buildLogEntry('info', message, context);
    this.logger.log(message, logEntry);
  }

  log(message: string, context?: LogContext): void {
    const logEntry = this.buildLogEntry('log', message, context);
    this.logger.log(message, logEntry);
  }

  error(message: string, context?: LogContext): void {
    const logEntry = this.buildLogEntry('error', message, context);
    this.logger.error(message, logEntry);
  }

  warn(message: string, context?: LogContext): void {
    // Renamed from warning to warn for consistency with Winston
    const logEntry = this.buildLogEntry('warn', message, context);
    this.logger.warn(message, logEntry);
  }

  debug(message: string, context?: LogContext): void {
    const logEntry = this.buildLogEntry('debug', message, context);
    this.logger.debug(message, logEntry);
  }

  private getCaller(): string | undefined {
    const stack = new Error().stack;
    if (!stack) return undefined;
    const stackLines = stack.split('\n').map((line) => line.trim());

    // Find the first stack line that is NOT from logging.service.ts
    for (const line of stackLines) {
      if (
        line &&
        !line.includes('logging.service') &&
        (line.startsWith('at ') || line.match(/\(([^)]+)\)/))
      ) {
        // Extract file path and line number
        const match = line.match(/\(([^)]+)\)/) || line.match(/at (.+)/);
        return match ? match[1] : undefined;
      }
    }
    return undefined;
  }
}

/**
 * {
              streams: [
                {
                  stream: {
                    app: 'payment-service',
                    level: info.level,
                    tranceId,
                  },
                  values: [[`${Date.now() * 1000000}`], JSON.stringify(info)],
                },
              ],
            };
 */
