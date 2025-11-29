import type { CommandContext } from "../src/cli/context.js";
import type { FileSystem } from "../src/utils/file-system.js";
import {
  createPrerequisiteManager,
  type CommandRunner
} from "../src/utils/prerequisites.js";

export function createTestCommandContext(fs: FileSystem): CommandContext {
  const runner: CommandRunner = async () => ({
    stdout: "",
    stderr: "",
    exitCode: 0
  });

  return {
    fs,
    runCommand: runner,
    prerequisites: createPrerequisiteManager({
      isDryRun: false,
      runCommand: runner
    }),
    flushDryRun() {},
    complete: () => {}
  };
}
