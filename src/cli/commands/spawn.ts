import type { Command } from "commander";
import type { CliContainer } from "../container.js";
import {
  buildProviderContext,
  createExecutionResources,
  resolveCommandFlags,
  resolveServiceAdapter
} from "./shared.js";
import type { CommandRunnerResult } from "../../utils/prerequisites.js";

export interface SpawnCommandOptions {
  prompt: string;
  args: string[];
}

export function registerSpawnCommand(
  program: Command,
  container: CliContainer
): void {
  program
    .command("spawn")
    .description("Run a single prompt through a configured service CLI.")
    .argument(
      "<service>",
      "Service to spawn (claude-code | codex | opencode)"
    )
    .argument("<prompt>", "Prompt text to send")
    .argument(
      "[agentArgs...]",
      "Additional arguments forwarded to the service CLI"
    )
    .action(async (service: string, promptText: string, agentArgs: string[] = []) => {
      const adapter = resolveServiceAdapter(container, service);
      if (!adapter.supportsSpawn) {
        throw new Error(`${adapter.label} does not support spawn.`);
      }

      const flags = resolveCommandFlags(program);
      const resources = createExecutionResources(
        container,
        flags,
        `spawn:${service}`
      );
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
          const output = await entry.spawn(providerContext, {
            prompt: promptText,
            args: agentArgs
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
