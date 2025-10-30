import type { Command } from "commander";
import type { CliContainer } from "../container.js";
import { executeConfigure } from "./configure.js";
import { resolveCommandFlags } from "./shared.js";

export function registerRootHandler(
  program: Command,
  container: CliContainer
): void {
  program.action(async () => {
    const services = container.registry.list();
    const flags = resolveCommandFlags(program);
    const logger = container.loggerFactory.create({
      dryRun: flags.dryRun,
      verbose: flags.verbose,
      scope: "root"
    });

    if (services.length === 0) {
      logger.info("No services available to configure.");
      return;
    }

    services.forEach((entry, index) => {
      logger.info(`${index + 1}) ${entry.name}`);
    });

    logger.info("Enter number that you want to configure:");

    const descriptor = container.promptLibrary.serviceSelection();
    const response = await container.prompts(descriptor);
    const selection = response[descriptor.name];

    const normalized =
      typeof selection === "number"
        ? selection
        : typeof selection === "string"
        ? Number.parseInt(selection, 10)
        : NaN;

    if (!Number.isInteger(normalized)) {
      throw new Error("Invalid service selection.");
    }

    const index = normalized - 1;
    if (index < 0 || index >= services.length) {
      throw new Error("Invalid service selection.");
    }

    await executeConfigure(program, container, services[index].name, {});
  });
}
