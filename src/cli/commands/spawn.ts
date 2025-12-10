import path from "node:path";
import type { Command } from "commander";
import type { CliContainer } from "../container.js";
import {
  buildProviderContext,
  createExecutionResources,
  resolveCommandFlags,
  resolveServiceAdapter,
  type CommandFlags,
  type ExecutionResources
,
  resolveProviderHandler
} from "./shared.js";
import type { CommandRunnerResult } from "../../utils/command-checks.js";
import type { SpawnCommandOptions } from "../../providers/spawn-options.js";

export interface CustomSpawnHandlerContext {
  container: CliContainer;
  service: string;
  options: SpawnCommandOptions;
  flags: CommandFlags;
  resources: ExecutionResources;
}

export type CustomSpawnHandler = (
  context: CustomSpawnHandlerContext
) => Promise<void>;

export interface RegisterSpawnCommandOptions {
  handlers?: Record<string, CustomSpawnHandler>;
  extraServices?: string[];
}

export function registerSpawnCommand(
  program: Command,
  container: CliContainer,
  options: RegisterSpawnCommandOptions = {}
): void {
  const defaultServices = ["claude-code", "codex", "opencode"];
  const serviceList =
    options.extraServices && options.extraServices.length > 0
      ? [...defaultServices, ...options.extraServices]
      : defaultServices;
  const serviceDescription = `Service to spawn (${serviceList.join(" | ")})`;

  program
    .command("spawn")
    .description("Run a single prompt through a configured service CLI.")
    .option("--model <model>", "Model identifier override passed to the service CLI")
    .option("-C, --cwd <path>", "Working directory for the service CLI")
    .argument(
      "<service>",
      serviceDescription
    )
    .argument("<prompt>", "Prompt text to send")
    .argument(
      "[agentArgs...]",
      "Additional arguments forwarded to the service CLI"
    )
    .action(async function (
      this: Command,
      service: string,
      promptText: string,
      agentArgs: string[] = []
    ) {
      const flags = resolveCommandFlags(program);
      const resources = createExecutionResources(
        container,
        flags,
        `spawn:${service}`
      );
      const commandOptions = this.opts<{ model?: string; cwd?: string }>();
      const cwdOverride = resolveSpawnWorkingDirectory(
        container.env.cwd,
        commandOptions.cwd
      );
      const spawnOptions: SpawnCommandOptions = {
        prompt: promptText,
        args: agentArgs,
        model: commandOptions.model,
        cwd: cwdOverride
      };

      const customHandler = options.handlers?.[service];
      if (customHandler) {
        await customHandler({
          container,
          service,
          options: spawnOptions,
          flags,
          resources
        });
        return;
      }

      const adapter = resolveServiceAdapter(container, service);
      if (typeof adapter.spawn !== "function") {
        throw new Error(`${adapter.label} does not support spawn.`);
      }

      const providerContext = buildProviderContext(
        container,
        adapter,
        resources
      );

      if (flags.dryRun) {
        const extra =
          spawnOptions.args && spawnOptions.args.length > 0
            ? ` with args ${JSON.stringify(spawnOptions.args)}`
            : "";
        const cwdSuffix = spawnOptions.cwd ? ` from ${spawnOptions.cwd}` : "";
        resources.logger.dryRun(
          `Dry run: would spawn ${adapter.label} with prompt "${spawnOptions.prompt}"${extra}${cwdSuffix}.`
        );
        return;
      }

      const result = (await container.registry.invoke(
        service,
        "spawn",
        async (entry) => {
          if (!entry.spawn) {
            throw new Error(`${adapter.label} does not support spawn.`);
          }
          const resolution = await resolveProviderHandler(entry, providerContext, {
            useResolver: false
          });
          if (!resolution.adapter.spawn) {
            throw new Error(`${adapter.label} does not support spawn.`);
          }
          const output = await resolution.adapter.spawn(
            providerContext,
            spawnOptions
          );
          return output as CommandRunnerResult | void;
        }
      )) as CommandRunnerResult | void;

      if (!result) {
        resources.logger.info(`${adapter.label} spawn completed.`);
        return;
      }

      if (result.exitCode !== 0) {
        const detail = result.stderr.trim() || result.stdout.trim();
        const suffix = detail ? `: ${detail}` : "";
        throw new Error(
          `${adapter.label} spawn failed with exit code ${result.exitCode}${suffix}`
        );
      }

      const trimmedStdout = result.stdout.trim();
      if (trimmedStdout) {
        resources.logger.info(trimmedStdout);
        return;
      }

      const trimmedStderr = result.stderr.trim();
      if (trimmedStderr) {
        resources.logger.info(trimmedStderr);
        return;
      }

      resources.logger.info(`${adapter.label} spawn completed.`);
    });
}

function resolveSpawnWorkingDirectory(
  baseDir: string,
  candidate?: string
): string | undefined {
  if (!candidate || candidate.trim().length === 0) {
    return undefined;
  }
  if (path.isAbsolute(candidate)) {
    return candidate;
  }
  return path.resolve(baseDir, candidate);
}
