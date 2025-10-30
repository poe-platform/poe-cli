import chalk from "chalk";
import type { LoggerFn } from "./types.js";

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
  dryRun(message: string): void;
  verbose(message: string): void;
  child(context: Partial<LoggerContext>): ScopedLogger;
}

export interface LoggerFactory {
  base: LoggerFn;
  create(context?: LoggerContext): ScopedLogger;
}

const defaultEmitter: LoggerFn = (message) => {
  console.log(message);
};

export function createLoggerFactory(
  emitter: LoggerFn = defaultEmitter
): LoggerFactory {
  const create = (context: LoggerContext = {}): ScopedLogger => {
    const dryRun = context.dryRun ?? false;
    const verbose = context.verbose ?? false;
    const scope = context.scope;

    const format = (message: string): string => {
      if (!scope) {
        return message;
      }
      return `${chalk.dim(`[${scope}]`)} ${message}`;
    };

    const send = (message: string): void => {
      emitter(format(message));
    };

    const scoped: ScopedLogger = {
      context: { dryRun, verbose, scope },
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
      dryRun(message) {
        if (dryRun) {
          send(chalk.cyan(`[dry-run] ${message}`));
          return;
        }
        send(message);
      },
      verbose(message) {
        if (verbose) {
          send(chalk.dim(message));
        }
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

  return { base: emitter, create };
}
