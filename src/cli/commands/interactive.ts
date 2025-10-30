import type { Command } from "commander";
import type { CliContainer } from "../container.js";

export function registerInteractiveCommand(
  program: Command,
  container: CliContainer
): void {
  program
    .command("interactive")
    .alias("i")
    .description("Launch interactive mode with a visual CLI interface.")
    .action(async () => {
      const logger = container.loggerFactory.create({
        dryRun: false,
        verbose: true,
        scope: "interactive"
      });
      logger.info("Launching interactive mode...");
      const { launchInteractiveMode } = await import(
        "../interactive-launcher.js"
      );
      await launchInteractiveMode(container.dependencies);
    });
}
