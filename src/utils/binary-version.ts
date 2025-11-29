import type { CommandRunner, CommandRunnerResult } from "./hooks.js";
import { coerce } from "semver";

export interface BinaryVersionDetectionResult {
  version: string;
  rawOutput: string;
}

export async function detectBinaryVersion(
  runCommand: CommandRunner,
  binaryName: string,
  args: string[] = ["--version"]
): Promise<BinaryVersionDetectionResult> {
  const result = await runCommand(binaryName, args);
  if (result.exitCode !== 0) {
    const detail = formatFailureDetail(result);
    const suffix = detail.length > 0 ? ` (${detail})` : "";
    throw new Error(
      `${formatCommand(binaryName, args)} exited with code ${result.exitCode}${suffix}`
    );
  }
  const raw = `${result.stdout}\n${result.stderr}`.trim();
  const parsed = coerce(raw);
  if (!parsed) {
    throw new Error(`Unable to parse version for ${binaryName}: ${raw}`);
  }
  return {
    version: parsed.version,
    rawOutput: raw
  };
}

function formatCommand(binaryName: string, args: string[]): string {
  return [binaryName, ...args].join(" ").trim();
}

function formatFailureDetail(result: CommandRunnerResult): string {
  const hints: string[] = [];
  if (result.exitCode < 0) {
    hints.push("process failed to start (is the binary installed?)");
  }
  const detail = [result.stderr, result.stdout]
    .map((value) => value.trim())
    .find((value) => value.length > 0);
  if (detail) {
    hints.push(detail);
  }
  return hints.join("; ");
}
