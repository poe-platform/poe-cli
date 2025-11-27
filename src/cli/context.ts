import {
  DryRunRecorder,
  createDryRunFileSystem,
  formatDryRunOperations
} from "../utils/dry-run.js";
import type { FileSystem } from "../utils/file-system.js";
import type {
  CommandRunner,
  CommandRunnerResult,
  PrerequisiteManager,
  PrerequisitePhase,
  PrerequisiteRunHooks
} from "../utils/prerequisites.js";
import { createPrerequisiteManager } from "../utils/prerequisites.js";
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
  prerequisites: PrerequisiteManager;
  runCommand: CommandRunner;
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
    const prerequisites = createPrerequisiteManager({
      isDryRun: options.dryRun,
      runCommand: options.runner
    });

    if (!options.dryRun) {
      return {
        fs,
        prerequisites,
        runCommand: options.runner,
        complete(messages) {
          options.logger.info(messages.success);
        }
      };
    }

    const recorder = new DryRunRecorder();
    const proxyFs = createDryRunFileSystem(fs, recorder);
    const recordedCommands = new Set<string>();

    const flush = (): void => {
      for (const line of formatDryRunOperations(recorder.drain())) {
        const base = extractBaseCommand(line);
        if (!recordedCommands.has(base)) {
          options.logger.info(line);
          recordedCommands.add(base);
        }
      }
    };

    return {
      fs: proxyFs,
      prerequisites,
      runCommand: options.runner,
      complete(messages) {
        options.logger.dryRun(messages.dry);
        flush();
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

export function createPrerequisiteHooks(
  phase: PrerequisitePhase,
  logger: ScopedLogger
): PrerequisiteRunHooks | undefined {
  if (!logger.context.verbose) {
    return undefined;
  }

  return {
    onStart(prerequisite) {
      logger.verbose(
        `Running ${phase} prerequisite: ${prerequisite.description}`
      );
    },
    onSuccess(prerequisite) {
      logger.verbose(`✓ ${prerequisite.description}`);
    },
    onFailure(prerequisite, error) {
      const detail =
        error instanceof Error ? error.message : String(error ?? "Unknown error");
      logger.error(`✖ ${prerequisite.description}: ${detail}`);
    }
  };
}

export function normalizePhase(value: string): PrerequisitePhase {
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
