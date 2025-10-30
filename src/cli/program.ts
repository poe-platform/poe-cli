import { Command } from "commander";
import {
  createCliContainer,
  type CliContainer,
  type CliDependencies
} from "./container.js";
import { registerRootHandler } from "./commands/root.js";
import { registerInitCommand } from "./commands/init.js";
import { registerConfigureCommand } from "./commands/configure.js";
import { registerLoginCommand } from "./commands/login.js";
import { registerLogoutCommand } from "./commands/logout.js";
import { registerTestCommand } from "./commands/test.js";
import { registerQueryCommand } from "./commands/query.js";
import { registerAgentCommand } from "./commands/agent.js";
import { registerPrerequisitesCommand } from "./commands/prerequisites.js";
import { registerRemoveCommand } from "./commands/remove.js";
import { registerSpawnCommand } from "./commands/spawn.js";
import { registerSpawnWorktreeCommand } from "./commands/spawn-worktree.js";
import { registerInteractiveCommand } from "./commands/interactive.js";

export function createProgram(dependencies: CliDependencies): Command {
  const container = createCliContainer(dependencies);
  const program = bootstrapProgram(container);

  if (dependencies.exitOverride ?? true) {
    applyExitOverride(program);
  }

  return program;
}

function bootstrapProgram(container: CliContainer): Command {
  const program = new Command();
  program
    .name("poe-setup")
    .description("CLI tool to configure Poe API for various development tools.")
    .option("--dry-run", "Simulate commands without writing changes.")
    .option("--verbose", "Enable verbose logging.");

  registerRootHandler(program, container);
  registerInitCommand(program, container);
  registerConfigureCommand(program, container);
  registerLoginCommand(program, container);
  registerLogoutCommand(program, container);
  registerTestCommand(program, container);
  registerQueryCommand(program, container);
  registerAgentCommand(program, container);
  registerPrerequisitesCommand(program, container);
  registerRemoveCommand(program, container);
  registerSpawnCommand(program, container);
  registerSpawnWorktreeCommand(program, container);
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
