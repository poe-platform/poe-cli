import type { CommandRunnerResult } from "../utils/prerequisites.js";
import {
  configureOpenCode as baseConfigureOpenCode,
  installOpenCode as baseInstallOpenCode,
  registerOpenCodePrerequisites as baseRegisterOpenCodePrerequisites,
  removeOpenCode as baseRemoveOpenCode
} from "poe-code/dist/providers/opencode.js";
import type {
  ConfigureOpenCodeOptions,
  RemoveOpenCodeOptions,
  SpawnOpenCodeOptions
} from "poe-code/dist/providers/opencode.js";

export type {
  ConfigureOpenCodeOptions,
  RemoveOpenCodeOptions,
  SpawnOpenCodeOptions
} from "poe-code/dist/providers/opencode.js";

export function configureOpenCode(
  options: ConfigureOpenCodeOptions
): Promise<void> {
  return baseConfigureOpenCode(options);
}

export function installOpenCode(options: Parameters<typeof baseInstallOpenCode>[0]) {
  return baseInstallOpenCode(options);
}

export function registerOpenCodePrerequisites(
  manager: Parameters<typeof baseRegisterOpenCodePrerequisites>[0]
): void {
  baseRegisterOpenCodePrerequisites(manager);
}

export function removeOpenCode(
  options: RemoveOpenCodeOptions
): Promise<void> {
  return baseRemoveOpenCode(options);
}

export function spawnOpenCode(
  options: SpawnOpenCodeOptions
): Promise<CommandRunnerResult> {
  const args = ["run", options.prompt, ...(options.args ?? [])];
  return options.runCommand("opencode", args);
}
