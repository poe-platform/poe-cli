import { Command } from "commander";
import {
  createCliContainer,
  type CliContainer,
  type CliDependencies
} from "./container.js";
import { registerRootHandler } from "./commands/root.js";
import { registerInitCommand } from "./commands/init.js";
import { registerConfigureCommand } from "./commands/configure.js";
import { registerConfigureAgentsCommand } from "./commands/configure-agents.js";
import { registerLoginCommand } from "poe-code/dist/cli/commands/login.js";
import { registerLogoutCommand } from "./commands/logout.js";
import { registerTestCommand } from "./commands/test.js";
import { registerQueryCommand } from "./commands/query.js";
import { registerAgentCommand } from "./commands/agent.js";
import {
  registerSpawnCommand
} from "poe-code/dist/cli/commands/spawn.js";
import { registerPrerequisitesCommand } from "./commands/prerequisites.js";
import { registerRemoveCommand } from "./commands/remove.js";
import { registerInteractiveCommand } from "./commands/interactive.js";
import { createPoeCodeSpawnHandler } from "./spawn-handlers.js";

export function createProgram(dependencies: CliDependencies): Command {
  const container = createCliContainer(dependencies);
  const program = bootstrapProgram(container);

  if (dependencies.exitOverride ?? true) {
    applyExitOverride(program);
  }

  if (dependencies.suppressCommanderOutput) {
    suppressCommanderOutput(program);
  }

  return program;
}

function bootstrapProgram(container: CliContainer): Command {
  const program = new Command();
  program
    .name("poe-code")
    .description("CLI tool to configure Poe API for developer workflows.")
    .option("-y, --yes", "Accept defaults without prompting.")
    .option("--dry-run", "Simulate commands without writing changes.")
    .option("--verbose", "Enable verbose logging.");

  registerRootHandler(program, container);
  registerInitCommand(program, container);
  const configureCommand = registerConfigureCommand(program, container);
  registerConfigureAgentsCommand(configureCommand, container);
  registerLoginCommand(program, container);
  registerLogoutCommand(program, container);
  registerTestCommand(program, container);
  registerQueryCommand(program, container);
  registerAgentCommand(program, container);
  registerSpawnCommand(program, container, {
    handlers: {
      "poe-code": createPoeCodeSpawnHandler()
    },
    extraServices: ["poe-code"]
  });
  registerPrerequisitesCommand(program, container);
  registerRemoveCommand(program, container);
  registerInteractiveCommand(program, container);

  return program;
}

export type { CliDependencies };

function applyExitOverride(command: Command): void {
  command.exitOverride();
  for (const child of command.commands) {
    applyExitOverride(child);
  }
}

function suppressCommanderOutput(command: Command): void {
  command.configureOutput({
    writeOut: () => {},
    writeErr: () => {}
  });
  for (const child of command.commands) {
    suppressCommanderOutput(child);
  }
}
