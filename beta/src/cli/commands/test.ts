import type { Command } from "commander";
import type { CliContainer } from "../container.js";
import { resolveCommandFlags } from "./shared.js";

export interface TestCommandOptions {
  apiKey?: string;
}

export function registerTestCommand(
  program: Command,
  container: CliContainer
): void {
  program
    .command("test")
    .description('Verify the Poe API key by sending "Ping" to EchoBot.')
    .option("--api-key <key>", "Poe API key")
    .action(async (options: TestCommandOptions) => {
      const flags = resolveCommandFlags(program);
      const logger = container.loggerFactory.create({
        dryRun: flags.dryRun,
        verbose: flags.verbose,
        scope: "test"
      });

      const apiKey = await container.options.resolveApiKey({
        value: options.apiKey,
        dryRun: flags.dryRun
      });

      if (flags.dryRun) {
        logger.dryRun(
          'would verify Poe API key by calling EchoBot with "Ping".'
        );
        return;
      }

      await container.poeApiClient.verify({ apiKey });
      logger.info("Poe API key verified via EchoBot.");
    });
}
