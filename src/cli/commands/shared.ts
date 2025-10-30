import type { Command } from "commander";
import type { CliContainer } from "../container.js";
import type {
  ProviderAdapter,
  ProviderContext
} from "../service-registry.js";
import {
  createLoggingCommandRunner,
  createMutationLogger,
  createPrerequisiteHooks,
  normalizePhase,
  type CommandContext,
  type MutationLogEntry
} from "../context.js";
import type { ScopedLogger } from "../logger.js";
import type { ServiceMutationHooks } from "../../services/service-manifest.js";
import type { PrerequisitePhase } from "../../utils/prerequisites.js";

export interface CommandFlags {
  dryRun: boolean;
  verbose: boolean;
}

export interface ExecutionResources {
  logger: ScopedLogger;
  context: CommandContext;
  mutationHooks?: ServiceMutationHooks;
  recordMutation?: (entry: MutationLogEntry) => void;
}

export function resolveCommandFlags(program: Command): CommandFlags {
  const opts = program.optsWithGlobals();
  return {
    dryRun: Boolean(opts.dryRun),
    verbose: Boolean(opts.verbose)
  };
}

export function createExecutionResources(
  container: CliContainer,
  flags: CommandFlags,
  scope: string
): ExecutionResources {
  const baseLogger = container.loggerFactory.create({
    dryRun: flags.dryRun,
    verbose: flags.verbose,
    scope
  });
  const runner = flags.verbose
    ? createLoggingCommandRunner(container.commandRunner, baseLogger)
    : container.commandRunner;
  const context = container.contextFactory.create({
    dryRun: flags.dryRun,
    logger: baseLogger,
    runner
  });

  const mutationHooks = createMutationLogger(baseLogger, {
    collector: context.recordMutation
  });

  return {
    logger: baseLogger,
    context,
    mutationHooks,
    recordMutation: context.recordMutation
  };
}

export function buildProviderContext(
  container: CliContainer,
  adapter: ProviderAdapter,
  resources: ExecutionResources
): ProviderContext {
  return {
    env: container.env,
    paths: adapter.resolvePaths(container.env),
    command: resources.context,
    logger: resources.logger
  };
}

export function registerProviderPrerequisites(
  adapter: ProviderAdapter,
  resources: ExecutionResources
): void {
  adapter.registerPrerequisites?.(resources.context.prerequisites);
}

export async function runPrerequisites(
  adapter: ProviderAdapter,
  resources: ExecutionResources,
  phase: PrerequisitePhase
): Promise<void> {
  const hooks = createPrerequisiteHooks(phase, resources.logger);
  if (hooks) {
    await resources.context.prerequisites.run(phase, hooks);
  } else {
    await resources.context.prerequisites.run(phase);
  }
}

export function resolveServiceAdapter(
  container: CliContainer,
  service: string
): ProviderAdapter {
  const adapter = container.registry.get(service);
  if (!adapter) {
    throw new Error(`Unknown service "${service}".`);
  }
  return adapter;
}

export { normalizePhase };
