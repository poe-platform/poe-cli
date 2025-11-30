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

export function createTelemetryClient(_logger: ScopedLogger): TelemetryClient {
  const record = (_event: TelemetryEvent): void => {
    // Telemetry events are recorded but not logged
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
