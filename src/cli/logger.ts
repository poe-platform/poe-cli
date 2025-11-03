import chalk from "chalk";
import type { LoggerFn } from "./types.js";
import type { ErrorLogger, ErrorContext } from "./error-logger.js";

export interface LoggerContext {
  dryRun?: boolean;
  verbose?: boolean;
  scope?: string;
}

export interface ScopedLogger {
  readonly context: Required<Pick<LoggerContext, "dryRun" | "verbose">> &
    Pick<LoggerContext, "scope">;
  info(message: string): void;
  success(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  errorWithStack(error: Error, context?: ErrorContext): void;
  logException(error: Error, operation: string, context?: ErrorContext): void;
  dryRun(message: string): void;
  verbose(message: string): void;
  child(context: Partial<LoggerContext>): ScopedLogger;
}

export interface LoggerFactory {
  base: LoggerFn;
  errorLogger?: ErrorLogger;
  create(context?: LoggerContext): ScopedLogger;
  setErrorLogger(errorLogger: ErrorLogger): void;
}

const defaultEmitter: LoggerFn = (message) => {
  console.log(message);
};

export function createLoggerFactory(
  emitter: LoggerFn = defaultEmitter
): LoggerFactory {
  let errorLogger: ErrorLogger | undefined;

  const create = (context: LoggerContext = {}): ScopedLogger => {
    const dryRun = context.dryRun ?? false;
    const verbose = context.verbose ?? false;
    const scope = context.scope;

    const send = (message: string): void => {
      emitter(message);
    };

    const scoped: ScopedLogger = {
      context: { dryRun, verbose, scope: context.scope },
      info(message) {
        send(message);
      },
      success(message) {
        send(chalk.green(message));
      },
      warn(message) {
        send(chalk.yellow(message));
      },
      error(message) {
        send(chalk.red(message));
      },
      errorWithStack(error, errorContext) {
        send(chalk.red(error.message));

        if (errorLogger) {
          const fullContext: ErrorContext = {
            ...errorContext,
            scope,
            component: scope
          };
          errorLogger.logError(error, fullContext);
        } else {
          // Fallback if error logger not available
          console.error("Stack trace:", error.stack);
        }
      },
      logException(error, operation, errorContext) {
        send(chalk.red(`Error during ${operation}: ${error.message}`));

        if (errorLogger) {
          const fullContext: ErrorContext = {
            ...errorContext,
            operation,
            scope,
            component: scope
          };
          errorLogger.logErrorWithStackTrace(error, operation, fullContext);
        } else {
          // Fallback if error logger not available
          console.error("Stack trace:", error.stack);
        }
      },
      dryRun(message) {
        send(message);
      },
      verbose(message) {
        if (!verbose) {
          return;
        }
        send(message);
      },
      child(next) {
        return create({
          dryRun: next.dryRun ?? dryRun,
          verbose: next.verbose ?? verbose,
          scope: next.scope ?? scope
        });
      }
    };

    return scoped;
  };

  return {
    base: emitter,
    errorLogger,
    create,
    setErrorLogger(logger: ErrorLogger) {
      errorLogger = logger;
    }
  };
}
