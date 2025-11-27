import type {
  CommandRunner,
  CommandRunnerResult
} from "../utils/prerequisites.js";
import type { FileSystem } from "../utils/file-system.js";
import {
  claudeCodeService as baseClaudeCodeService,
  CLAUDE_CODE_INSTALL_DEFINITION
} from "poe-code/dist/providers/claude-code.js";
import {
  runServiceInstall,
  type InstallContext
} from "poe-code/dist/services/service-install.js";
import type {
  ClaudeCodeConfigureOptions,
  ClaudeCodeRemoveOptions
} from "poe-code/dist/providers/claude-code.js";

type ConfigureClaudeCodeOptions = ClaudeCodeConfigureOptions & {
  fs: FileSystem;
};

type RemoveClaudeCodeOptions = ClaudeCodeRemoveOptions & {
  fs: FileSystem;
};

type InstallClaudeCodeOptions = InstallContext;

type SpawnClaudeCodeOptions = {
  prompt: string;
  args?: string[];
  runCommand: CommandRunner;
};

export async function configureClaudeCode(
  options: ConfigureClaudeCodeOptions
): Promise<void> {
  await baseClaudeCodeService.configure({
    fs: options.fs,
    options: {
      apiKey: options.apiKey,
      settingsPath: options.settingsPath,
      keyHelperPath: options.keyHelperPath,
      credentialsPath: options.credentialsPath,
      defaultModel: options.defaultModel
    }
  });
}

export function installClaudeCode(
  options: InstallClaudeCodeOptions
): Promise<boolean> {
  return runServiceInstall(CLAUDE_CODE_INSTALL_DEFINITION, options);
}

export function registerClaudePrerequisites(
  manager: Parameters<NonNullable<
    typeof baseClaudeCodeService.registerPrerequisites
  >>[0]
): void {
  baseClaudeCodeService.registerPrerequisites?.(manager);
}

export async function removeClaudeCode(
  options: RemoveClaudeCodeOptions
): Promise<boolean> {
  return baseClaudeCodeService.remove({
    fs: options.fs,
    options: {
      settingsPath: options.settingsPath,
      keyHelperPath: options.keyHelperPath
    }
  });
}

export function spawnClaudeCode(
  options: SpawnClaudeCodeOptions
): Promise<CommandRunnerResult> {
  const defaults = [
    "-p",
    options.prompt,
    "--allowedTools",
    "Bash,Read",
    "--permission-mode",
    "acceptEdits",
    "--output-format",
    "text"
  ];
  const args = [...defaults, ...(options.args ?? [])];
  return options.runCommand("claude", args);
}
