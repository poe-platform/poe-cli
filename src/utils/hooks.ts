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

export interface RunAndMatchOutputOptions {
  command: string;
  args: string[];
  expectedOutput: string;
  skipOnDryRun?: boolean;
}

export function describeCommandExpectation(
  command: string,
  args: string[],
  expectedOutput: string
): string {
  return `${renderCommandLine(command, args)} (expecting "${expectedOutput}")`;
}

export interface CommandExpectationHookOptions
  extends RunAndMatchOutputOptions {
  id: string;
}

export function createCommandExpectationHook(
  options: CommandExpectationHookOptions
): HookDefinition {
  return {
    id: options.id,
    description: describeCommandExpectation(
      options.command,
      options.args,
      options.expectedOutput
    ),
    async run(context) {
      await runAndMatchOutput(context, options);
    }
  };
}

export async function runAndMatchOutput(
  context: HookContext,
  options: RunAndMatchOutputOptions
): Promise<void> {
  const rendered = renderCommandLine(options.command, options.args);
  if (options.skipOnDryRun !== false && context.isDryRun) {
    if (context.logDryRun) {
      context.logDryRun(
        `Dry run: ${rendered} (expecting "${options.expectedOutput}")`
      );
    }
    return;
  }

  const result = await context.runCommand(options.command, options.args);
  if (result.exitCode !== 0) {
    const detail = formatCommandRunnerResult(result);
    throw new Error(
      [`Command ${rendered} failed with exit code ${result.exitCode}.`, detail].join("\n")
    );
  }

  if (!stdoutMatchesExpected(result.stdout, options.expectedOutput)) {
    const detail = formatCommandRunnerResult(result);
    const received = result.stdout.trim();
    throw new Error(
      [
        `Command ${rendered} failed: expected "${options.expectedOutput}" but received "${received}".`,
        detail
      ].join("\n")
    );
  }
}

function stdoutMatchesExpected(stdout: string, expected: string): boolean {
  const trimmed = stdout.trim();
  if (trimmed === expected) {
    return true;
  }

  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .some((line) => line === expected);
}

function renderCommandLine(command: string, args: string[]): string {
  return [command, ...args].map(quoteIfNeeded).join(" ").trim();
}

function quoteIfNeeded(value: string): string {
  if (value.length === 0) {
    return '""';
  }
  if (needsQuoting(value)) {
    return `"${value.replaceAll('"', '\\"')}"`;
  }
  return value;
}

function needsQuoting(value: string): boolean {
  return (
    value.includes(" ") ||
    value.includes("\t") ||
    value.includes("\n")
  );
}

export type HookPhase = "before" | "after";

export interface HookContext {
  isDryRun: boolean;
  runCommand: CommandRunner;
  logDryRun?: (message: string) => void;
}

export interface HookDefinition {
  id: string;
  description?: string;
  run(context: HookContext): Promise<void>;
}

export interface HookManager {
  registerBefore(hook: HookDefinition): void;
  registerAfter(hook: HookDefinition): void;
  run(phase: HookPhase, hooks?: HookRunHooks): Promise<void>;
}

export interface HookRunHooks {
  onStart?(hook: HookDefinition): void;
  onSuccess?(hook: HookDefinition): void;
  onFailure?(hook: HookDefinition, error: unknown): void;
}

export function createHookManager(init: {
  isDryRun: boolean;
  runCommand: CommandRunner;
  logDryRun?: (message: string) => void;
}): HookManager {
  const store: Record<HookPhase, HookDefinition[]> = {
    before: [],
    after: []
  };

  return {
    registerBefore(hook: HookDefinition) {
      store.before.push(hook);
    },
    registerAfter(hook: HookDefinition) {
      store.after.push(hook);
    },
    async run(phase: HookPhase, hooks?: HookRunHooks): Promise<void> {
      const failures: string[] = [];
      for (const hookDefinition of store[phase]) {
        hooks?.onStart?.(hookDefinition);
        try {
          await hookDefinition.run({
            isDryRun: init.isDryRun,
            runCommand: init.runCommand,
            logDryRun: init.logDryRun
          });
          hooks?.onSuccess?.(hookDefinition);
        } catch (error) {
          const detail =
            error instanceof Error ? error.message : String(error);
          failures.push(`${formatHookLabel(hookDefinition)}: ${detail}`);
          hooks?.onFailure?.(hookDefinition, error);
        }
      }

      if (failures.length > 0) {
        const suffix = failures.length === 1 ? "" : "s";
        const message = failures.map((line) => `- ${line}`).join("\n");
        throw new Error(`Failed ${phase} hook${suffix}:\n${message}`);
      }
    }
  };
}

function formatHookLabel(hook: HookDefinition): string {
  const description = hook.description?.trim();
  const suffix = description?.length ? ` ${description}` : "";
  return `[${hook.id}]${suffix}`;
}

/**
 * Creates a hook that detects if a binary exists using multiple fallback methods.
 * This is useful in Docker/containerized environments where PATH may not be updated after npm install.
 *
 * @param binaryName - The name of the binary to check for (e.g., "claude", "codex")
 * @param id - Unique identifier for the hook
 * @param description - Human-readable description of what's being checked
 * @returns A HookDefinition that checks for the binary using multiple detection methods
 */
export function createBinaryExistsCheck(
  binaryName: string,
  id: string,
  description: string
): HookDefinition {
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
