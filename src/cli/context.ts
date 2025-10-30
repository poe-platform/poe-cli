import chalk from "chalk";
import { DryRunRecorder, formatDryRunOperations } from "../utils/dry-run.js";
import { createDryRunFileSystem } from "../utils/dry-run.js";
import type { FileSystem } from "../utils/file-system.js";
import type {
  CommandRunner,
  CommandRunnerResult,
  PrerequisiteManager,
  PrerequisitePhase,
  PrerequisiteRunHooks
} from "../utils/prerequisites.js";
import { createPrerequisiteManager } from "../utils/prerequisites.js";
import type {
  MutationLogDetails,
  ServiceMutationHooks,
  ServiceMutationOutcome
} from "../services/service-manifest.js";
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

export interface MutationLogEntry {
  command: string;
  message: string;
}

export interface CommandContext {
  fs: FileSystem;
  prerequisites: PrerequisiteManager;
  recordMutation?: (entry: MutationLogEntry) => void;
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
    const entries: MutationLogEntry[] = [];

    const recordMutation = (entry: MutationLogEntry): void => {
      entries.push(entry);
      recordedCommands.add(entry.command);
    };

    const flush = (): void => {
      for (const entry of entries) {
        options.logger.info(entry.message);
      }
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
      recordMutation,
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

export function createMutationLogger(
  logger: ScopedLogger,
  options: { collector?: (entry: MutationLogEntry) => void }
): ServiceMutationHooks | undefined {
  const { collector } = options;
  const verbose = logger.context.verbose;
  if (!verbose && !collector) {
    return undefined;
  }

  const emit = (entry: MutationLogEntry): void => {
    collector?.(entry);
    if (verbose) {
      logger.info(entry.message);
    }
  };

  return {
    onStart() {
      // Start is intentionally silent to keep verbose logging focused on results.
    },
    onComplete(details, outcome) {
      const command = formatMutationCommand(details, outcome);
      emit({
        command,
        message: decorateMutationCommand(command, outcome)
      });
    },
    onError(details, error) {
      const command = formatMutationCommand(details);
      const rendered = renderMutationError(command, error);
      logger.error(rendered);
      collector?.({ command, message: rendered });
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

function renderMutationError(command: string, error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error);
  return chalk.red(`${command} ! ${detail}`);
}

function formatMutationCommand(
  details: MutationLogDetails,
  outcome?: ServiceMutationOutcome
): string {
  const target = details.targetPath;
  const effect = outcome?.effect;
  if (effect && effect !== "none") {
    return describeEffect(effect, target);
  }
  switch (details.kind) {
    case "ensureDirectory":
      return describeEffect("mkdir", target);
    case "createBackup":
      return describeEffect("copy", target);
    case "removeFile":
      return describeEffect("delete", target);
    case "writeTemplate":
    case "transformFile":
      return describeEffect("write", target);
    default:
      return details.label;
  }
}

function decorateMutationCommand(
  command: string,
  outcome: ServiceMutationOutcome
): string {
  const colored = colorizeMutation(command, outcome);
  const suffix = describeOutcomeDetail(outcome);
  return suffix ? `${colored} ${chalk.dim(`# ${suffix}`)}` : colored;
}

function colorizeMutation(
  command: string,
  outcome: ServiceMutationOutcome
): string {
  if (!outcome.changed || outcome.effect === "none") {
    return chalk.dim(command);
  }
  switch (outcome.effect) {
    case "mkdir":
    case "copy":
      return chalk.cyan(command);
    case "delete":
      return chalk.red(command);
    case "write":
      return chalk.green(command);
    default:
      return command;
  }
}

function describeOutcomeDetail(
  outcome: ServiceMutationOutcome
): string | undefined {
  switch (outcome.detail) {
    case "create":
      return "create";
    case "update":
      return "update";
    case "delete":
      return "delete";
    case "noop":
      return "no change";
    default:
      return outcome.detail;
  }
}

function describeEffect(effect: string, target?: string): string {
  switch (effect) {
    case "mkdir":
      return target ? `mkdir -p ${target}` : "mkdir -p";
    case "copy":
      return target ? `cp ${target} ${target}.bak` : "cp <target> <target>.bak";
    case "write":
      return target ? `cat > ${target}` : "cat > <target>";
    case "delete":
      return target ? `rm ${target}` : "rm <target>";
    default:
      return effect;
  }
}

function extractBaseCommand(message: string): string {
  const raw = stripAnsi(message);
  const detailIndex = raw.indexOf(" #");
  return detailIndex >= 0 ? raw.slice(0, detailIndex).trim() : raw.trim();
}

function stripAnsi(value: string): string {
  return value.replace(/\u001B\[[0-9;]*m/g, "");
}
