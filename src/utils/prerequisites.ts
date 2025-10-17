export interface CommandRunnerResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export type CommandRunner = (
  command: string,
  args: string[]
) => Promise<CommandRunnerResult>;

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

  const register = (
    phase: PrerequisitePhase,
    prerequisite: PrerequisiteDefinition
  ) => {
    store[phase].push(prerequisite);
  };

  return {
    registerBefore(prerequisite: PrerequisiteDefinition) {
      register("before", prerequisite);
    },
    registerAfter(prerequisite: PrerequisiteDefinition) {
      register("after", prerequisite);
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
