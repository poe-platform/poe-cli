import { detectBinaryVersion } from "./binary-version.js";
export interface CommandRunnerResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export type CommandRunner = (
  command: string,
  args: string[]
) => Promise<CommandRunnerResult>;

export function formatCommandRunnerResult(
  result: CommandRunnerResult
): string {
  const stdout =
    result.stdout.length > 0 ? result.stdout : "<empty>";
  const stderr =
    result.stderr.length > 0 ? result.stderr : "<empty>";
  return `stdout:\n${stdout}\nstderr:\n${stderr}`;
}

export type PrerequisitePhase = "before" | "after";

export interface PrerequisiteContext {
  isDryRun: boolean;
  runCommand: CommandRunner;
}

export interface PrerequisiteDefinition {
  id: string;
  description: string;
  run(context: PrerequisiteContext): Promise<void>;
}

export interface PrerequisiteManager {
  registerBefore(prerequisite: PrerequisiteDefinition): void;
  registerAfter(prerequisite: PrerequisiteDefinition): void;
  run(
    phase: PrerequisitePhase,
    hooks?: PrerequisiteRunHooks
  ): Promise<void>;
}

export interface PrerequisiteRunHooks {
  onStart?(prerequisite: PrerequisiteDefinition): void;
  onSuccess?(prerequisite: PrerequisiteDefinition): void;
  onFailure?(prerequisite: PrerequisiteDefinition, error: unknown): void;
}

export function createPrerequisiteManager(init: {
  isDryRun: boolean;
  runCommand: CommandRunner;
}): PrerequisiteManager {
  const store: Record<PrerequisitePhase, PrerequisiteDefinition[]> = {
    before: [],
    after: []
  };

  return {
    registerBefore(prerequisite: PrerequisiteDefinition) {
      store.before.push(prerequisite);
    },
    registerAfter(prerequisite: PrerequisiteDefinition) {
      store.after.push(prerequisite);
    },
    async run(
      phase: PrerequisitePhase,
      hooks?: PrerequisiteRunHooks
    ): Promise<void> {
      const failures: string[] = [];
      for (const prerequisite of store[phase]) {
        hooks?.onStart?.(prerequisite);
        try {
          await prerequisite.run({
            isDryRun: init.isDryRun,
            runCommand: init.runCommand
          });
          hooks?.onSuccess?.(prerequisite);
        } catch (error) {
          const detail =
            error instanceof Error ? error.message : String(error);
          failures.push(`${prerequisite.description}: ${detail}`);
          hooks?.onFailure?.(prerequisite, error);
        }
      }

      if (failures.length > 0) {
        const suffix = failures.length === 1 ? "" : "s";
        const message = failures.map((line) => `- ${line}`).join("\n");
        throw new Error(`Failed ${phase} prerequisite${suffix}:\n${message}`);
      }
    }
  };
}

/**
 * Creates a prerequisite check that detects if a binary exists using multiple fallback methods.
 * This is useful in Docker/containerized environments where PATH may not be updated after npm install.
 *
 * @param binaryName - The name of the binary to check for (e.g., "claude", "codex")
 * @param id - Unique identifier for the prerequisite
 * @param description - Human-readable description of what's being checked
 * @returns A PrerequisiteDefinition that checks for the binary using multiple detection methods
 */
export function createBinaryExistsCheck(
  binaryName: string,
  id: string,
  description: string
): PrerequisiteDefinition {
  return {
    id,
    description,
    async run({ runCommand }) {
      const detectors: Array<{
        command: string;
        args: string[];
        validate: (result: CommandRunnerResult) => boolean;
      }> = [
        {
          command: "which",
          args: [binaryName],
          validate: (result) => result.exitCode === 0
        },
        {
          command: "where",
          args: [binaryName],
          validate: (result) =>
            result.exitCode === 0 && result.stdout.trim().length > 0
        },
        {
          command: "test",
          args: ["-f", `/usr/local/bin/${binaryName}`],
          validate: (result) => result.exitCode === 0
        },
        {
          command: "ls",
          args: [`/usr/local/bin/${binaryName}`],
          validate: (result) => result.exitCode === 0
        }
      ];

      for (const detector of detectors) {
        const result = await runCommand(detector.command, detector.args);
        if (detector.validate(result)) {
          await detectBinaryVersion(runCommand, binaryName);
          return;
        }
      }

      throw new Error(`${binaryName} CLI binary not found on PATH.`);
    }
  };
}
