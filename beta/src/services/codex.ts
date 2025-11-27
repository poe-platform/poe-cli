import type {
  CommandRunner,
  CommandRunnerResult
} from "../utils/prerequisites.js";
import type { FileSystem } from "../utils/file-system.js";
import {
  buildCodexExecArgs as baseBuildCodexExecArgs,
  codexService as baseCodexService,
  CODEX_INSTALL_DEFINITION
} from "poe-code/dist/providers/codex.js";
import type {
  CodexConfigureOptions,
  CodexRemoveOptions
} from "poe-code/dist/providers/codex.js";
import {
  runServiceInstall,
  type InstallContext
} from "poe-code/dist/services/service-install.js";

type ConfigureCodexOptions = CodexConfigureOptions & {
  fs: FileSystem;
};

type RemoveCodexOptions = CodexRemoveOptions & {
  fs: FileSystem;
};

type InstallCodexOptions = InstallContext;

type SpawnCodexOptions = {
  prompt: string;
  args?: string[];
  runCommand: CommandRunner;
};

export function installCodex(
  options: InstallCodexOptions
): Promise<boolean> {
  return runServiceInstall(CODEX_INSTALL_DEFINITION, options);
}

export async function configureCodex(
  options: ConfigureCodexOptions
): Promise<void> {
  await baseCodexService.configure({
    fs: options.fs,
    options: {
      configPath: options.configPath,
      apiKey: options.apiKey,
      model: options.model,
      reasoningEffort: options.reasoningEffort,
      timestamp: options.timestamp
    }
  });
}

export function registerCodexPrerequisites(
  manager: Parameters<NonNullable<
    typeof baseCodexService.registerPrerequisites
  >>[0]
): void {
  baseCodexService.registerPrerequisites?.(manager);
}

export async function removeCodex(
  options: RemoveCodexOptions
): Promise<boolean> {
  return baseCodexService.remove({
    fs: options.fs,
    options: {
      configPath: options.configPath
    }
  });
}

export function spawnCodex(
  options: SpawnCodexOptions
): Promise<CommandRunnerResult> {
  const args = baseBuildCodexExecArgs(options.prompt, options.args);
  return options.runCommand("codex", args);
}

export function buildCodexExecArgs(
  prompt: Parameters<typeof baseBuildCodexExecArgs>[0],
  extraArgs?: Parameters<typeof baseBuildCodexExecArgs>[1]
): string[] {
  return baseBuildCodexExecArgs(prompt, extraArgs);
}
