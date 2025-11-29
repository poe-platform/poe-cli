import type { CommandContext } from "../src/cli/context.js";
import type { FileSystem } from "../src/utils/file-system.js";
import {
  createHookManager,
  type CommandRunner
} from "../src/utils/hooks.js";

export function createTestCommandContext(fs: FileSystem): CommandContext {
  const runner: CommandRunner = async () => ({
    stdout: "",
    stderr: "",
    exitCode: 0
  });

  return {
    fs,
    runCommand: runner,
    hooks: createHookManager({
      isDryRun: false,
      runCommand: runner
    }),
    flushDryRun() {},
    complete: () => {}
  };
}
