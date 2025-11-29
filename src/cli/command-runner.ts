import { spawn } from "node:child_process";
import type {
  CommandRunner,
  CommandRunnerResult
} from "../utils/command-checks.js";

export function createDefaultCommandRunner(): CommandRunner {
  return async (command, args): Promise<CommandRunnerResult> =>
    await new Promise((resolve) => {
      const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";

      child.stdout?.setEncoding("utf8");
      child.stdout?.on("data", (chunk: string | Buffer) => {
        stdout += chunk.toString();
      });

      child.stderr?.setEncoding("utf8");
      child.stderr?.on("data", (chunk: string | Buffer) => {
        stderr += chunk.toString();
      });

      child.on("error", (error: NodeJS.ErrnoException) => {
        const exitCode =
          typeof error.code === "number"
            ? error.code
            : typeof error.errno === "number"
            ? error.errno
            : 127;
        const message =
          error instanceof Error ? error.message : String(error ?? "error");
        resolve({
          stdout,
          stderr: stderr ? `${stderr}${message}` : message,
          exitCode
        });
      });

      child.on("close", (code) => {
        resolve({
          stdout,
          stderr,
          exitCode: code ?? 0
        });
      });
    });
}
