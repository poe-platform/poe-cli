import type { Command } from "commander";
import type { CliContainer } from "../container.js";
import { resolveCommandFlags } from "./shared.js";
import { DEFAULT_QUERY_MODEL } from "../constants.js";

export interface QueryCommandOptions {
  apiKey?: string;
  model?: string;
}

export function registerQueryCommand(
  program: Command,
  container: CliContainer
): void {
  program
    .command("query")
    .description(
      "Send a prompt to a Poe model via the OpenAI-compatible API and print the response."
    )
    .argument("<text>", "Prompt text to send")
    .option("--model <model>", "Model identifier", DEFAULT_QUERY_MODEL)
    .option("--api-key <key>", "Poe API key")
    .action(async (text: string, options: QueryCommandOptions) => {
      const flags = resolveCommandFlags(program);
      const logger = container.loggerFactory.create({
        dryRun: flags.dryRun,
        verbose: flags.verbose,
        scope: "query"
      });

      const model = options.model ?? DEFAULT_QUERY_MODEL;

      if (flags.dryRun) {
        logger.dryRun(
          `Dry run: would query "${model}" with text "${text}".`
        );
        return;
      }

      try {
        const apiKey = await container.options.resolveApiKey({
          value: options.apiKey,
          dryRun: flags.dryRun
        });

        const content = await container.poeApiClient.query({
          apiKey,
          model,
          prompt: text
        });

        logger.info(`${model}: ${content}`);
      } catch (error) {
        if (error instanceof Error) {
          logger.logException(error, "query command", {
            operation: "query model",
            model,
            promptLength: text.length
          });
        }
        throw error;
      }
    });
}
