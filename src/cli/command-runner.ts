import { spawn } from "node:child_process";
import type {
  CommandRunner,
  CommandRunnerOptions,
  CommandRunnerResult
} from "../utils/command-checks.js";

export function createDefaultCommandRunner(): CommandRunner {
  return async (
    command,
    args,
    options?: CommandRunnerOptions
  ): Promise<CommandRunnerResult> =>
    await new Promise((resolve) => {
      const hasStdin = options?.stdin != null;
      const child = spawn(command, args, {
        stdio: [hasStdin ? "pipe" : "ignore", "pipe", "pipe"],
        cwd: options?.cwd,
        env: options?.env
          ? {
              ...(process.env as Record<string, string | undefined>),
              ...options.env
            }
          : undefined
      });
      let stdout = "";
      let stderr = "";

      if (hasStdin && child.stdin) {
        child.stdin.on("error", () => {});
        child.stdin.end(options!.stdin);
      }

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
