import type { CommandContext } from "../src/cli/context.js";
import type { FileSystem } from "../src/utils/file-system.js";
import { type CommandRunner } from "../src/utils/command-checks.js";

export function createTestCommandContext(fs: FileSystem): CommandContext {
  const runner: CommandRunner = async () => ({
    stdout: "",
    stderr: "",
    exitCode: 0
  });

  return {
    fs,
    runCommand: runner,
    flushDryRun() {},
    complete: () => {}
  };
}
