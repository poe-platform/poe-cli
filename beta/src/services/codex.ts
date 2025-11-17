import type { CommandRunnerResult } from "../utils/prerequisites.js";
import {
  buildCodexExecArgs as baseBuildCodexExecArgs,
  configureCodex as baseConfigureCodex,
  installCodex as baseInstallCodex,
  registerCodexPrerequisites as baseRegisterCodexPrerequisites,
  removeCodex as baseRemoveCodex
} from "poe-code/dist/providers/codex.js";
import type {
  ConfigureCodexOptions,
  RemoveCodexOptions,
  SpawnCodexOptions
} from "poe-code/dist/providers/codex.js";

export type {
  ConfigureCodexOptions,
  RemoveCodexOptions,
  SpawnCodexOptions
} from "poe-code/dist/providers/codex.js";

export function configureCodex(
  options: ConfigureCodexOptions
): Promise<void> {
  return baseConfigureCodex(options);
}

export function installCodex(options: Parameters<typeof baseInstallCodex>[0]) {
  return baseInstallCodex(options);
}

export function registerCodexPrerequisites(
  manager: Parameters<typeof baseRegisterCodexPrerequisites>[0]
): void {
  baseRegisterCodexPrerequisites(manager);
}

export function removeCodex(options: RemoveCodexOptions): Promise<void> {
  return baseRemoveCodex(options);
}

export function spawnCodex(
  options: SpawnCodexOptions
): Promise<CommandRunnerResult> {
  const args = buildCodexExecArgs(options.prompt, options.args);
  return options.runCommand("codex", args);
}

export function buildCodexExecArgs(
  prompt: Parameters<typeof baseBuildCodexExecArgs>[0],
  extraArgs?: Parameters<typeof baseBuildCodexExecArgs>[1]
): string[] {
  return baseBuildCodexExecArgs(prompt, extraArgs);
}
