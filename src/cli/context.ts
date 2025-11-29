import {
  DryRunRecorder,
  createDryRunFileSystem,
  formatDryRunOperations
} from "../utils/dry-run.js";
import type { FileSystem } from "../utils/file-system.js";
import type {
  CommandRunner,
  CommandRunnerResult,
  HookDefinition,
  HookManager,
  HookPhase,
  HookRunHooks
} from "../utils/hooks.js";
import { createHookManager } from "../utils/hooks.js";
import type { ScopedLogger } from "./logger.js";

export interface CommandContextOptions {
  dryRun: boolean;
  logger: ScopedLogger;
  runner: CommandRunner;
}

export interface CommandContextComplete {
  success: string;
  dry: string;
}

export interface CommandContext {
  fs: FileSystem;
  hooks: HookManager;
  runCommand: CommandRunner;
  flushDryRun(options?: { emitIfEmpty?: boolean }): void;
  complete(messages: CommandContextComplete): void;
}

export interface CommandContextFactoryInit {
  fs: FileSystem;
}

export interface CommandContextFactory {
  create(options: CommandContextOptions): CommandContext;
}

export function createCommandContextFactory(
  init: CommandContextFactoryInit
): CommandContextFactory {
  const { fs } = init;

  const create = (options: CommandContextOptions): CommandContext => {
    const hooks = createHookManager({
      isDryRun: options.dryRun,
      runCommand: options.runner,
      logDryRun: (message) => options.logger.dryRun(message)
    });

    if (!options.dryRun) {
      return {
        fs,
        hooks,
        runCommand: options.runner,
        flushDryRun() {},
        complete(messages) {
          options.logger.info(messages.success);
        }
      };
    }

    const recorder = new DryRunRecorder();
    const proxyFs = createDryRunFileSystem(fs, recorder);
    const recordedCommands = new Set<string>();
    let hasEmittedOperations = false;

    const flush = (emitIfEmpty = false): void => {
      const operations = recorder.drain();
      if (operations.length === 0) {
        if (emitIfEmpty && !hasEmittedOperations) {
          const lines = formatDryRunOperations(operations);
          for (const line of lines) {
            options.logger.info(line);
          }
        }
        return;
      }
      hasEmittedOperations = true;

      for (const line of formatDryRunOperations(operations)) {
        const base = extractBaseCommand(line);
        if (!recordedCommands.has(base)) {
          options.logger.info(line);
          recordedCommands.add(base);
        }
      }
    };

    return {
      fs: proxyFs,
      hooks,
      runCommand: options.runner,
      flushDryRun({ emitIfEmpty }: { emitIfEmpty?: boolean } = {}) {
        flush(Boolean(emitIfEmpty));
      },
      complete(messages) {
        options.logger.dryRun(messages.dry);
        flush(true);
      }
    };
  };

  return { create };
}

export function createLoggingCommandRunner(
  runner: CommandRunner,
  logger: ScopedLogger
): CommandRunner {
  return async (command, args): Promise<CommandRunnerResult> => {
    const rendered = [command, ...args].join(" ").trim();
    logger.verbose(`> ${rendered}`);
    return runner(command, args);
  };
}

export function createHookTracer(
  phase: HookPhase,
  logger: ScopedLogger
): HookRunHooks | undefined {
  if (!logger.context.verbose) {
    return undefined;
  }

  return {
    onStart(hook) {
      logger.verbose(`Running ${phase} hook ${formatHookDisplay(hook)}`);
    },
    onSuccess(hook) {
      logger.verbose(`✓ ${formatHookDisplay(hook)}`);
    },
    onFailure(hook, error) {
      const detail =
        error instanceof Error ? error.message : String(error ?? "Unknown error");
      logger.error(`✖ ${formatHookDisplay(hook)}: ${detail}`);
    }
  };
}

export function normalizeHookPhase(value: string): HookPhase {
  const normalized = value.toLowerCase();
  if (normalized === "before" || normalized === "after") {
    return normalized;
  }
  throw new Error(`Unknown phase "${value}". Use "before" or "after".`);
}

function extractBaseCommand(message: string): string {
  const raw = stripAnsi(message);
  const detailIndex = raw.indexOf(" #");
  return detailIndex >= 0 ? raw.slice(0, detailIndex).trim() : raw.trim();
}

function stripAnsi(value: string): string {
  return value.replace(/\u001B\[[0-9;]*m/g, "");
}

function formatHookDisplay(hook: HookDefinition): string {
  const description = hook.description?.trim();
  return description?.length
    ? `[${hook.id}] ${description}`
    : `[${hook.id}]`;
}
