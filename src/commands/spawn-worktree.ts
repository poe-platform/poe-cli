import type { CommandRunnerResult } from "../utils/prerequisites.js";
import {
  createWorktree as createWorktreeDefault,
  getChanges as getChangesDefault,
  isGitRepository as isGitRepositoryDefault,
  mergeChanges as mergeChangesDefault,
  type MergeResult,
  type WorktreeContext
} from "../utils/worktree.js";

interface SpawnGitWorktreeDependencies {
  isGitRepository: typeof isGitRepositoryDefault;
  createWorktree: typeof createWorktreeDefault;
  getChanges: typeof getChangesDefault;
  mergeChanges: typeof mergeChangesDefault;
}

interface SpawnGitWorktreeOptions {
  agent: string;
  prompt: string;
  agentArgs: string[];
  basePath: string;
  targetBranch: string;
  runAgent: (input: {
    agent: string;
    prompt: string;
    args: string[];
    cwd: string;
  }) => Promise<CommandRunnerResult>;
  logger: (message: string) => void;
  dependencies?: Partial<SpawnGitWorktreeDependencies>;
}

const defaultDependencies: SpawnGitWorktreeDependencies = {
  isGitRepository: isGitRepositoryDefault,
  createWorktree: createWorktreeDefault,
  getChanges: getChangesDefault,
  mergeChanges: mergeChangesDefault
};

function resolveDependencies(
  overrides?: Partial<SpawnGitWorktreeDependencies>
): SpawnGitWorktreeDependencies {
  if (!overrides) {
    return defaultDependencies;
  }
  return {
    isGitRepository:
      overrides.isGitRepository ?? defaultDependencies.isGitRepository,
    createWorktree: overrides.createWorktree ?? defaultDependencies.createWorktree,
    getChanges: overrides.getChanges ?? defaultDependencies.getChanges,
    mergeChanges: overrides.mergeChanges ?? defaultDependencies.mergeChanges
  };
}

export async function spawnGitWorktree(
  options: SpawnGitWorktreeOptions
): Promise<void> {
  const deps = resolveDependencies(options.dependencies);
  const isRepo = await deps.isGitRepository(options.basePath);
  if (!isRepo) {
    throw new Error(`"${options.basePath}" is not a git repository.`);
  }

  const context = await deps.createWorktree(options.basePath);
  let shouldCleanup = false;

  const preserveAndThrow = (message: string, cause?: unknown) => {
    options.logger(`Worktree preserved at ${context.path}`);
    const base =
      cause instanceof Error
        ? cause
        : cause
        ? new Error(String(cause))
        : undefined;
    const wrapped = new Error(message, { cause: base });
    (wrapped as { worktreeLogged?: boolean }).worktreeLogged = true;
    throw wrapped;
  };

  try {
    const initialResult = await runAgentWithContext({
      ...options,
      context
    });
    if (initialResult.exitCode !== 0) {
      return preserveAndThrow("Agent execution failed", initialResult);
    }

    const mergeResult = await deps.mergeChanges(
      context.path,
      options.targetBranch
    );
    if (mergeResult.outcome === "conflict") {
      await handleConflicts({
        options,
        context,
        mergeResult,
        dependencies: deps
      });
      shouldCleanup = true;
      return;
    }

    if (mergeResult.outcome === "no-changes") {
      options.logger("No changes detected; nothing to merge.");
      shouldCleanup = true;
      return;
    }

    shouldCleanup = true;
    options.logger("Worktree changes merged successfully.");
  } catch (error) {
    if (
      error instanceof Error &&
      (error as { worktreeLogged?: boolean }).worktreeLogged
    ) {
      throw error;
    }
    preserveAndThrow(
      error instanceof Error ? error.message : "Unexpected failure",
      error
    );
  } finally {
    if (shouldCleanup) {
      await context.cleanup();
    }
  }
}

async function runAgentWithContext(input: {
  agent: string;
  prompt: string;
  agentArgs: string[];
  runAgent: SpawnGitWorktreeOptions["runAgent"];
  context: WorktreeContext;
}): Promise<CommandRunnerResult> {
  const { agent, prompt, agentArgs, runAgent, context } = input;
  const previousCwd = process.cwd();
  let changedDirectory = false;
  try {
    process.chdir(context.path);
    changedDirectory = true;
  } catch (error) {
    if (
      !(error instanceof Error) ||
      (error as NodeJS.ErrnoException).code !== "ERR_WORKER_UNSUPPORTED_OPERATION"
    ) {
      throw error;
    }
  }
  try {
    return await runAgent({
      agent,
      prompt,
      args: agentArgs,
      cwd: context.path
    });
  } finally {
    if (changedDirectory) {
      process.chdir(previousCwd);
    }
  }
}

async function handleConflicts(input: {
  options: SpawnGitWorktreeOptions;
  context: WorktreeContext;
  mergeResult: MergeResult;
  dependencies: SpawnGitWorktreeDependencies;
}): Promise<void> {
  const { options, context, mergeResult, dependencies } = input;
  const files = mergeResult.files.join(", ");
  options.logger(`Merge conflicts detected in: ${files}`);
  options.logger("Attempting automated conflict resolution.");

  const resolutionPrompt = `Merge conflicts in: ${files}. Resolve using git commands.`;
  const resolutionResult = await runAgentWithContext({
    agent: options.agent,
    prompt: resolutionPrompt,
    agentArgs: options.agentArgs,
    runAgent: options.runAgent,
    context
  });
  if (resolutionResult.exitCode !== 0) {
    throw new Error("Agent execution failed during conflict resolution.");
  }

  const finalMerge = await dependencies.mergeChanges(
    context.path,
    options.targetBranch
  );
  if (finalMerge.outcome !== "merged" && finalMerge.outcome !== "no-changes") {
    throw new Error("Merge failed after conflict resolution.");
  }

  options.logger("Conflicts resolved and merged successfully.");
}
