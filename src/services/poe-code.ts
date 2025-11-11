import type {
  CommandRunner,
  CommandRunnerResult
} from "../utils/prerequisites.js";

export interface SpawnPoeCodeOptions {
  prompt: string;
  args?: string[];
  runCommand: CommandRunner;
}

export async function spawnPoeCode(
  options: SpawnPoeCodeOptions
): Promise<CommandRunnerResult> {
  const args = ["agent", options.prompt, ...(options.args ?? [])];
  return await options.runCommand("poe-code", args);
}
