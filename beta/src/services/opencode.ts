import type { CommandRunnerResult } from "../utils/prerequisites.js";
import {
  configureOpenCode as baseConfigureOpenCode,
  OPEN_CODE_INSTALL_DEFINITION,
  registerOpenCodePrerequisites as baseRegisterOpenCodePrerequisites,
  removeOpenCode as baseRemoveOpenCode,
  spawnOpenCode as baseSpawnOpenCode
} from "poe-code/dist/providers/opencode.js";
import type {
  ConfigureOpenCodeOptions,
  RemoveOpenCodeOptions,
  SpawnOpenCodeOptions,
  InstallOpenCodeOptions
} from "poe-code/dist/providers/opencode.js";

export type {
  ConfigureOpenCodeOptions,
  RemoveOpenCodeOptions,
  SpawnOpenCodeOptions,
  InstallOpenCodeOptions
} from "poe-code/dist/providers/opencode.js";

export function configureOpenCode(
  options: ConfigureOpenCodeOptions
): Promise<void> {
  return baseConfigureOpenCode(options);
}

import { runServiceInstall } from "poe-code/dist/services/service-install.js";

export function installOpenCode(
  options: InstallOpenCodeOptions
): Promise<boolean> {
  return runServiceInstall(OPEN_CODE_INSTALL_DEFINITION, options);
}

export function registerOpenCodePrerequisites(
  manager: Parameters<typeof baseRegisterOpenCodePrerequisites>[0]
): void {
  baseRegisterOpenCodePrerequisites(manager);
}

export async function removeOpenCode(
  options: RemoveOpenCodeOptions
): Promise<boolean> {
  return baseRemoveOpenCode(options);
}

export function spawnOpenCode(
  options: SpawnOpenCodeOptions
): Promise<CommandRunnerResult> {
  return baseSpawnOpenCode(options);
}
