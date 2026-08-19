import { TAttributes, TContext, TSpan } from '@edulearn/core';

export enum TSpanStatusCode {
  UNSET = 0,
  OK = 1,
  ERROR = 2,
}

export abstract class ITraceService {
  /**
   * Starts a new {@link TSpan} and calls the given function passing it the
   * created span as first argument.
   * Additionally the new span gets set in context and this context is activated
   * for the duration of the function call.
   *
   * @param name The name of the span
   * @param [options] SpanOptions used for span creation
   * @param [context] TContext to use to extract parent
   * @param fn function called in the context of the span and receives the newly created span as an argument
   * @returns return value of fn
   * @example
   *     const something = tracer.startActiveSpan('op', span => {
   *       try {
   *         do some work
   *         span.setStatus({code: TSpanStatusCode.OK});
   *         return something;
   *       } catch (err) {
   *         span.setStatus({
   *           code: TSpanStatusCode.ERROR,
   *           message: err.message,
   *         });
   *         throw err;
   *       } finally {
   *         span.end();
   *       }
   *     });
   *
   * @example
   *     const span = tracer.startActiveSpan('op', span => {
   *       try {
   *         do some work
   *         return span;
   *       } catch (err) {
   *         span.setStatus({
   *           code: TSpanStatusCode.ERROR,
   *           message: err.message,
   *         });
   *         throw err;
   *       }
   *     });
   *     do some more work
   *     span.end();
   */
  abstract startActiveSpan<F extends (span: TSpan) => unknown>(
    name: string,
    fn: F,
  ): ReturnType<F>;
  abstract startActiveSpan<T>(
    name: string,
    fn: (span: TSpan) => T | Promise<T>,
    attributes?: TAttributes,
  ): T | Promise<T>;

  abstract startSpan(
    name: string,
    attributes?: TAttributes | Record<string | any, string | any>,
    contextOverride?: TContext,
  ): TSpan;

  abstract endSpan(span: TSpan): void;

  abstract recordException(span: TSpan, error: any): void;

  abstract setStatus(
    span: TSpan,
    code: TSpanStatusCode,
    message?: string,
  ): void;

  abstract setAttribute(span: TSpan, key: string, value: any): void;

  abstract getCurrentSpan(): TSpan | undefined;
}
