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

export interface CustomSpawnHandlerContext {
  container: CliContainer;
  service: string;
  prompt: string;
  args: string[];
  model?: string;
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
      const commandOptions = this.opts<{ model?: string }>();
      const modelOverride = commandOptions.model;

      const customHandler = options.handlers?.[service];
      if (customHandler) {
        await customHandler({
          container,
          service,
          prompt: promptText,
          args: agentArgs,
          model: modelOverride,
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
          agentArgs.length > 0 ? ` with args ${JSON.stringify(agentArgs)}` : "";
        resources.logger.dryRun(
          `Dry run: would spawn ${adapter.label} with prompt "${promptText}"${extra}.`
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
          const output = await resolution.adapter.spawn(providerContext, {
            prompt: promptText,
            args: agentArgs,
            model: modelOverride
          });
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
