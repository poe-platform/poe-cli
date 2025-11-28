import type { CommandRunner } from "./prerequisites.js";
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
    throw new Error(
      `${binaryName} ${args.join(" ")} exited with code ${result.exitCode}`
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
