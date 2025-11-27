import type { CommandRunnerResult } from "../utils/prerequisites.js";
import {
  openCodeService as baseOpenCodeService,
  OPEN_CODE_INSTALL_DEFINITION
} from "poe-code/dist/providers/opencode.js";
import type {
  ConfigureOpenCodeOptions,
  RemoveOpenCodeOptions,
  SpawnOpenCodeOptions,
  InstallOpenCodeOptions
} from "poe-code/dist/providers/opencode.js";
import { runServiceInstall } from "poe-code/dist/services/service-install.js";

export type {
  ConfigureOpenCodeOptions,
  RemoveOpenCodeOptions,
  SpawnOpenCodeOptions,
  InstallOpenCodeOptions
} from "poe-code/dist/providers/opencode.js";

export async function configureOpenCode(
  options: ConfigureOpenCodeOptions
): Promise<void> {
  await baseOpenCodeService.configure({
    fs: options.fs,
    options: {
      configPath: options.configPath,
      authPath: options.authPath,
      apiKey: options.apiKey
    }
  });
}

export function installOpenCode(
  options: InstallOpenCodeOptions
): Promise<boolean> {
  return runServiceInstall(OPEN_CODE_INSTALL_DEFINITION, options);
}

export function registerOpenCodePrerequisites(
  manager: Parameters<NonNullable<
    typeof baseOpenCodeService.registerPrerequisites
  >>[0]
): void {
  baseOpenCodeService.registerPrerequisites?.(manager);
}

export async function removeOpenCode(
  options: RemoveOpenCodeOptions
): Promise<boolean> {
  return baseOpenCodeService.remove({
    fs: options.fs,
    options: {
      configPath: options.configPath,
      authPath: options.authPath
    }
  });
}

export function spawnOpenCode(
  options: SpawnOpenCodeOptions
): Promise<CommandRunnerResult> {
  const args = ["run", options.prompt, ...(options.args ?? [])];
  return options.runCommand("opencode", args);
}
