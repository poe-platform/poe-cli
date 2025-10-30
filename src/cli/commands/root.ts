import type { Command } from "commander";
import type { CliContainer } from "../container.js";
import { launchInteractiveMode } from "../interactive-launcher.js";

export function registerRootHandler(
  program: Command,
  container: CliContainer
): void {
  program.action(async () => {
    await launchInteractiveMode(container.dependencies);
  });
}
