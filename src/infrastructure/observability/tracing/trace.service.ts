import { TracerService } from '@edulearn/nest';
import { Injectable } from '@nestjs/common';
import { TAttributes, TContext, TSpan } from '@edulearn/core';
import {
  ITraceService,
  TSpanStatusCode,
} from 'src/application/adaptors/trace.service';

@Injectable()
export class TraceService implements ITraceService {
  public constructor(private readonly tracer: TracerService) {}

  // Starts a new span and makes it active in the current context
  startActiveSpan<T>(
    name: string,
    fn: (span: TSpan) => T | Promise<T>,
    attributes?: TAttributes,
  ): T | Promise<T> {
    return this.tracer.startActiveSpan(
      name,
      async (span) => fn(span),
      attributes,
    );
  }

  // Starts a non-active span (useful if you manage context manually or for specific async flows)
  startSpan(
    name: string,
    attributes?: TAttributes,
    contextOverride?: TContext,
  ): TSpan {
    return this.tracer.startSpan(name, attributes, contextOverride);
  }

  endSpan(span: TSpan): void {
    span.end();
  }

  recordException(span: TSpan, error: any): void {
    span.recordException(error);
    span.setStatus({
      code: TSpanStatusCode.ERROR as any,
      message: error.message,
    }); // Set span status to ERROR on exception
  }

  setStatus(span: TSpan, code: TSpanStatusCode, message?: string): void {
    span.setStatus({ code: code as any, message });
  }

  setAttribute(span: TSpan, key: string, value: any): void {
    span.setAttribute(key, value);
  }

  // Get the current active span (useful for adding attributes to an existing span)
  getCurrentSpan(): TSpan | undefined {
    return this.tracer.getCurrentSpan();
  }
}
