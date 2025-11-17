import type { Command } from "commander";
import type { CliContainer } from "../container.js";
import {
  buildProviderContext,
  createExecutionResources,
  resolveCommandFlags,
  resolveServiceAdapter,
  type CommandFlags,
  type ExecutionResources
} from "./shared.js";
import type { CommandRunnerResult } from "../../utils/prerequisites.js";
import { DEFAULT_QUERY_MODEL } from "../constants.js";
import { runAgentConversation } from "./agent.js";

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
      "Service to spawn (claude-code | codex | opencode | poe-code)"
    )
    .argument("<prompt>", "Prompt text to send")
    .argument(
      "[agentArgs...]",
      "Additional arguments forwarded to the service CLI"
    )
    .action(async (service: string, promptText: string, agentArgs: string[] = []) => {
      const flags = resolveCommandFlags(program);
      const resources = createExecutionResources(
        container,
        flags,
        `spawn:${service}`
      );

      if (service === "poe-code") {
        await runPoeCodeSpawn({
          container,
          flags,
          resources,
          prompt: promptText,
          args: agentArgs
        });
        return;
      }

      const adapter = resolveServiceAdapter(container, service);
      if (!adapter.supportsSpawn) {
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

interface PoeCodeSpawnInput {
  container: CliContainer;
  flags: CommandFlags;
  resources: ExecutionResources;
  prompt: string;
  args: string[];
}

async function runPoeCodeSpawn(options: PoeCodeSpawnInput): Promise<void> {
  const parsedArgs = parsePoeCodeArgs(options.args);
  const model = parsedArgs.model ?? DEFAULT_QUERY_MODEL;

  if (options.flags.dryRun) {
    options.resources.logger.dryRun(
      `Dry run: would spawn Poe Code with prompt "${options.prompt}" using model "${model}".`
    );
    return;
  }

  const apiKey = await options.container.options.resolveApiKey({
    value: parsedArgs.apiKey,
    dryRun: options.flags.dryRun
  });

  const message = await runAgentConversation({
    container: options.container,
    logger: options.resources.logger,
    text: options.prompt,
    model,
    apiKey
  });

  options.resources.logger.info(message.replace("Agent response", "Poe Code response"));
}

interface PoeCodeArguments {
  model?: string;
  apiKey?: string;
}

function parsePoeCodeArgs(args: string[]): PoeCodeArguments {
  const result: PoeCodeArguments = {};
  let index = 0;
  while (index < args.length) {
    const current = args[index];
    const next = args[index + 1];
    if (current === "--model") {
      if (next == null) {
        throw new Error("Missing value for --model.");
      }
      result.model = next;
      index += 2;
      continue;
    }
    if (current === "--api-key") {
      if (next == null) {
        throw new Error("Missing value for --api-key.");
      }
      result.apiKey = next;
      index += 2;
      continue;
    }
    throw new Error(`Unknown option "${current}" for poe-code spawn.`);
  }
  return result;
}
