import { DEFAULT_QUERY_MODEL } from "./constants.js";
import { runAgentConversation } from "./commands/agent.js";
import type { CustomSpawnHandler } from "poe-code/dist/cli/commands/spawn.js";

export function createPoeCodeSpawnHandler(): CustomSpawnHandler {
  return async ({ container, flags, resources, prompt, args }) => {
    const parsed = parsePoeCodeArgs(args);
    const model = parsed.model ?? DEFAULT_QUERY_MODEL;

    if (flags.dryRun) {
      resources.logger.dryRun(
        `Dry run: would spawn Poe Code with prompt "${prompt}" using model "${model}".`
      );
      return;
    }

    const apiKey = await container.options.resolveApiKey({
      value: parsed.apiKey,
      dryRun: flags.dryRun
    });

    const message = await runAgentConversation({
      container,
      logger: resources.logger,
      text: prompt,
      model,
      apiKey
    });

    resources.logger.info(
      message.replace("Agent response", "Poe Code response")
    );
  };
}

interface PoeCodeArguments {
  model?: string;
  apiKey?: string;
}

function parsePoeCodeArgs(args: string[]): PoeCodeArguments {
  const result: PoeCodeArguments = {};
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (flag === "--model") {
      if (value == null) {
        throw new Error("Missing value for --model.");
      }
      result.model = value;
      continue;
    }
    if (flag === "--api-key") {
      if (value == null) {
        throw new Error("Missing value for --api-key.");
      }
      result.apiKey = value;
      continue;
    }
    throw new Error(`Unknown option "${flag}" for poe-code spawn.`);
  }
  return result;
}
