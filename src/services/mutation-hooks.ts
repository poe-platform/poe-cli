import type { ScopedLogger } from "../cli/logger.js";
import type {
  MutationLogDetails,
  ServiceMutationHooks,
  ServiceMutationOutcome
} from "./service-manifest.js";

export function createMutationLogger(
  logger: ScopedLogger
): ServiceMutationHooks {
  return {
    onStart(details) {
      logger.verbose(`Starting mutation: ${details.label}`);
    },
    onComplete(details, outcome) {
      logger.info(formatMutationMessage(details, outcome));
    },
    onError(details, error) {
      logger.error(
        `${details.label} failed: ${describeError(error)}`
      );
    }
  };
}

export function combineMutationHooks(
  ...hooks: Array<ServiceMutationHooks | undefined>
): ServiceMutationHooks | undefined {
  const active = hooks.filter(
    (hook): hook is ServiceMutationHooks => hook != null
  );
  if (active.length === 0) {
    return undefined;
  }
  return {
    onStart(details) {
      for (const hook of active) {
        hook.onStart?.(details);
      }
    },
    onComplete(details, outcome) {
      for (const hook of active) {
        hook.onComplete?.(details, outcome);
      }
    },
    onError(details, error) {
      for (const hook of active) {
        hook.onError?.(details, error);
      }
    }
  };
}

function formatMutationMessage(
  details: MutationLogDetails,
  outcome: ServiceMutationOutcome
): string {
  const status = describeOutcome(outcome);
  return `${details.label}: ${status}`;
}

function describeOutcome(outcome: ServiceMutationOutcome): string {
  if (outcome.changed) {
    return outcome.detail ?? outcome.effect;
  }
  if (outcome.detail && outcome.detail !== "noop") {
    return outcome.detail;
  }
  return "no changes";
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error ?? "Unknown error");
}
