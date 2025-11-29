import type { ScopedLogger } from "./logger.js";

export type ProviderOperation =
  | "install"
  | "configure"
  | "remove"
  | "spawn"
  | "test";

export type TelemetryStatus = "success" | "failure";

export interface TelemetryEvent {
  service: string;
  operation: ProviderOperation;
  status: TelemetryStatus;
  durationMs: number;
  error?: unknown;
}

export interface TelemetryClient {
  record(event: TelemetryEvent): void;
  wrap<T>(
    service: string,
    operation: ProviderOperation,
    task: () => Promise<T>
  ): Promise<T>;
}

export function createTelemetryClient(logger: ScopedLogger): TelemetryClient {
  const record = (event: TelemetryEvent): void => {
    const prefix = `${event.operation}:${event.service}`;
    const suffix =
      event.status === "success"
        ? `completed in ${event.durationMs.toFixed(0)}ms`
        : `failed in ${event.durationMs.toFixed(0)}ms`;
    const message = `${prefix} ${suffix}`;
    if (event.status === "success") {
      logger.verbose(message);
    } else {
      logger.error(message);
      if (event.error) {
        logger.error(
          event.error instanceof Error
            ? event.error.message
            : String(event.error)
        );
      }
    }
  };

  const wrap = async <T>(
    service: string,
    operation: ProviderOperation,
    task: () => Promise<T>
  ): Promise<T> => {
    const start = Date.now();
    try {
      const result = await task();
      record({
        service,
        operation,
        status: "success",
        durationMs: Date.now() - start
      });
      return result;
    } catch (error) {
      record({
        service,
        operation,
        status: "failure",
        durationMs: Date.now() - start,
        error
      });
      throw error;
    }
  };

  return { record, wrap };
}
