import type { CommandRunnerResult } from "../utils/prerequisites.js";
import {
  configureClaudeCode as baseConfigureClaudeCode,
  installClaudeCode as baseInstallClaudeCode,
  registerClaudeCodePrerequisites as baseRegisterClaudeCodePrerequisites,
  removeClaudeCode as baseRemoveClaudeCode
} from "poe-code/dist/providers/claude-code.js";
import type {
  ConfigureClaudeCodeOptions,
  InstallClaudeCodeOptions,
  RemoveClaudeCodeOptions,
  SpawnClaudeCodeOptions
} from "poe-code/dist/providers/claude-code.js";

export type {
  ConfigureClaudeCodeOptions,
  InstallClaudeCodeOptions,
  RemoveClaudeCodeOptions,
  SpawnClaudeCodeOptions
} from "poe-code/dist/providers/claude-code.js";

export function configureClaudeCode(
  options: ConfigureClaudeCodeOptions
): Promise<void> {
  return baseConfigureClaudeCode(options);
}

export function installClaudeCode(
  options: InstallClaudeCodeOptions
): Promise<void> {
  return baseInstallClaudeCode(options);
}

export function registerClaudePrerequisites(
  manager: Parameters<typeof baseRegisterClaudeCodePrerequisites>[0]
): void {
  baseRegisterClaudeCodePrerequisites(manager);
}

export function removeClaudeCode(
  options: RemoveClaudeCodeOptions
): Promise<void> {
  return baseRemoveClaudeCode(options);
}

export function spawnClaudeCode(
  options: SpawnClaudeCodeOptions
): Promise<CommandRunnerResult> {
  const defaultArgs = [
    "-p",
    options.prompt,
    "--allowedTools",
    "Bash,Read",
    "--permission-mode",
    "acceptEdits",
    "--output-format",
    "text"
  ];
  const args = [...defaultArgs, ...(options.args ?? [])];
  return options.runCommand("claude", args);
}
