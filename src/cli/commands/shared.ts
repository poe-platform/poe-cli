import type { Command } from "commander";
import type { CliContainer } from "../container.js";
import type {
  ProviderService,
  ProviderContext
} from "../service-registry.js";
import {
  createLoggingCommandRunner,
  createHookTracer,
  normalizeHookPhase,
  type CommandContext
} from "../context.js";
import type { ScopedLogger } from "../logger.js";
import type { HookPhase } from "../../utils/hooks.js";

export interface CommandFlags {
  dryRun: boolean;
  assumeYes: boolean;
}

export interface ExecutionResources {
  logger: ScopedLogger;
  context: CommandContext;
}

export function resolveCommandFlags(program: Command): CommandFlags {
  const opts = program.optsWithGlobals();
  return {
    dryRun: Boolean(opts.dryRun),
    assumeYes: Boolean(opts.yes)
  };
}

export function createExecutionResources(
  container: CliContainer,
  flags: CommandFlags,
  scope: string
): ExecutionResources {
  const baseLogger = container.loggerFactory.create({
    dryRun: flags.dryRun,
    verbose: true,
    scope
  });
  const runner = createLoggingCommandRunner(container.commandRunner, baseLogger);
  const context = container.contextFactory.create({
    dryRun: flags.dryRun,
    logger: baseLogger,
    runner
  });

  return {
    logger: baseLogger,
    context
  };
}

export function buildProviderContext(
  container: CliContainer,
  adapter: ProviderService,
  resources: ExecutionResources
): ProviderContext {
  const paths = adapter.resolvePaths
    ? adapter.resolvePaths(container.env)
    : {};
  return {
    env: container.env,
    paths,
    command: resources.context,
    logger: resources.logger
  };
}

export interface ProviderResolution {
  adapter: ProviderService;
  version: string | null;
}

export async function resolveProviderHandler(
  adapter: ProviderService,
  context: ProviderContext
): Promise<ProviderResolution> {
  if (adapter.resolveVersion) {
    return adapter.resolveVersion(context);
  }
  return {
    adapter,
    version: null
  };
}

export function registerProviderHooks(
  adapter: ProviderService,
  resources: ExecutionResources
): void {
  adapter.hooks?.before?.forEach((hook) =>
    resources.context.hooks.registerBefore(hook)
  );
  adapter.hooks?.after?.forEach((hook) =>
    resources.context.hooks.registerAfter(hook)
  );
}

export async function runProviderHooks(
  adapter: ProviderService,
  resources: ExecutionResources,
  phase: HookPhase
): Promise<void> {
  const hooks = createHookTracer(phase, resources.logger);
  if (hooks) {
    await resources.context.hooks.run(phase, hooks);
  } else {
    await resources.context.hooks.run(phase);
  }
}

export function resolveServiceAdapter(
  container: CliContainer,
  service: string
): ProviderService {
  const adapter = container.registry.get(service);
  if (!adapter) {
    throw new Error(`Unknown service "${service}".`);
  }
  return adapter;
}

export { normalizeHookPhase };
