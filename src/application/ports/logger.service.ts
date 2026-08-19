import { LoggerService } from '@nestjs/common';

/**
 * Represents the context information for logging operations.
 * This interface provides metadata that can be attached to log entries
 * to enable distributed tracing and correlation across microservices.
 *
 * @interface LogContext
 *
 * @property {string} [traceId] - Unique identifier for the entire trace across all services
 * @property {string} [spanId] - Unique identifier for a specific operation within a trace
 * @property {string} [userId] - Identifier of the user associated with the log entry
 * @property {string} [correlationId] - Correlation identifier for grouping related operations
 * @property {string} [service] - Name of the service generating the log entry
 * @property {string} [environment] - Environment where the service is running (e.g., 'development', 'production')
 * @property {string} [ctx] - Additional context string for custom logging information
 * @property {Record<string, unknown>} [key: string] - Extensible property for custom context data
 *
 * @example
 * const context: LogContext = {
 *   traceId: '550e8400-e29b-41d4-a716-446655440000',
 *   userId: 'user123',
 *   service: 'auth-service',
 *   environment: 'production'
 * };
 */
export interface LogContext {
  /** Eg. OpenTelemetry Trace ID */
  traceId?: string;
  /** Eg. OpenTelemetry Span ID */
  spanId?: string;
  /** Logged-in user ID  */
  userId?: string;
  correlationId?: string; // General correlation ID if different from traceId
  service?: string;
  /** Environment of the project, Eg. development, staging ..etc */
  environment?: string;
  /** Method or class in which logging */
  ctx?: string;
  /** Allows arbitrary additional context properties  */
  [key: string]: unknown;
}

export abstract class ILoggerService implements Partial<LoggerService> {
  /**
   * Logs an informational message with optional context.
   * @param {string} message - The message to log
   * @param {LogContext} [context] - Optional context information for the log entry
   */
  abstract info(message: string, context?: LogContext): void;

  /**
   * Logs an error message with optional context.
   * @param {string} message - The error message to log
   * @param {LogContext} [context] - Optional context information for the log entry
   */
  abstract error(message: string, context?: LogContext): void;

  abstract log(message: any, ...optionalParams: any[]): void;

  /**
   * Logs a warning message with optional context.
   * @param {string} message - The warning message to log
   * @param {LogContext} [context] - Optional context information for the log entry
   */
  abstract warn(message: string, context?: LogContext): void;

  /**
   * Logs a debug message with optional context.
   * @param {string} message - The debug message to log
   * @param {LogContext} [context] - Optional context information for the log entry
   */
  abstract debug(message: string, context?: LogContext): void;
}
