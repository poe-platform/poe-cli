import * as nodeFs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import {
  simpleGit as createSimpleGit,
  type SimpleGit,
  type StatusResult
} from "simple-git";

interface WorktreeDependencies {
  fs: typeof nodeFs;
  os: { tmpdir(): string };
  crypto: { randomBytes(size: number): Buffer };
  clock: { now(): number };
  gitFactory: (cwd: string) => SimpleGit;
}

interface WorktreeMetadata {
  root: string;
  branchName: string;
  baseCommit: string;
}

type WorktreeOverrides = Partial<Omit<WorktreeDependencies, "fs">> & {
  fs?: Partial<typeof nodeFs> &
    Pick<typeof nodeFs, "readFile" | "writeFile" | "mkdir">;
};

const registry = new Map<string, WorktreeMetadata>();

const defaultDependencies: WorktreeDependencies = {
  fs: nodeFs,
  os,
  crypto,
  clock: { now: () => Date.now() },
  gitFactory: (cwd: string) => createSimpleGit({ baseDir: cwd })
};

function resolveDependencies(
  overrides?: WorktreeOverrides
): WorktreeDependencies {
  if (!overrides) {
    return defaultDependencies;
  }
  const fsImpl = overrides.fs
    ? ({
        ...defaultDependencies.fs,
        ...overrides.fs
      } as typeof nodeFs)
    : defaultDependencies.fs;
  return {
    fs: fsImpl,
    os: overrides.os ?? defaultDependencies.os,
    crypto: overrides.crypto ?? defaultDependencies.crypto,
    clock: overrides.clock ?? defaultDependencies.clock,
    gitFactory: overrides.gitFactory ?? defaultDependencies.gitFactory
  };
}

export interface WorktreeContext {
  path: string;
  branchName: string;
  cleanup: () => Promise<void>;
}

export interface WorktreeChangeSummary {
  hasCommits: boolean;
  files: string[];
  status: StatusResult;
}

export type MergeOutcome = "no-changes" | "merged" | "conflict";

export interface MergeResult {
  outcome: MergeOutcome;
  files: string[];
  hasCommits: boolean;
  error?: Error;
}

export async function isGitRepository(
  cwd: string,
  overrides?: WorktreeOverrides
): Promise<boolean> {
  const deps = resolveDependencies(overrides);
  try {
    const git = deps.gitFactory(cwd);
    return await git.checkIsRepo();
  } catch {
    return false;
  }
}

export async function createWorktree(
  basePath: string,
  overrides?: WorktreeOverrides
): Promise<WorktreeContext> {
  const deps = resolveDependencies(overrides);
  const git = deps.gitFactory(basePath);
  const [rootRaw, baseCommitRaw] = await Promise.all([
    git.revparse(["--show-toplevel"]),
    git.revparse(["HEAD"])
  ]);
  const root = rootRaw.trim();
  const baseCommit = baseCommitRaw.trim();
  const timestamp = String(deps.clock.now());
  const suffix = deps.crypto.randomBytes(4).toString("hex");
  const branchName = `poe-worktree/${timestamp}-${suffix}`;
  const worktreePath = path.join(
    deps.os.tmpdir(),
    `poe-worktree-${timestamp}-${suffix}`
  );
  await git.raw(["worktree", "add", "-b", branchName, worktreePath]);
  registry.set(worktreePath, { root, branchName, baseCommit });

  return {
    path: worktreePath,
    branchName,
    async cleanup() {
      const metadata = registry.get(worktreePath);
      registry.delete(worktreePath);
      if (!metadata) {
        return;
      }
      const rootGit = deps.gitFactory(metadata.root);
      try {
        await rootGit.raw([
          "worktree",
          "remove",
          "--force",
          worktreePath
        ]);
      } catch {
        // Preserve cleanup best effort.
      }
      try {
        await rootGit.raw(["branch", "-D", metadata.branchName]);
      } catch {
        // Branch removal may fail if already removed; ignore.
      }
      await removePath(deps.fs, worktreePath);
    }
  };
}

export async function getChanges(
  worktreePath: string,
  overrides?: WorktreeOverrides
): Promise<WorktreeChangeSummary> {
  const deps = resolveDependencies(overrides);
  const metadata = registry.get(worktreePath);
  if (!metadata) {
    throw new Error(`Unknown worktree at ${worktreePath}`);
  }
  const git = deps.gitFactory(worktreePath);
  const status = await git.status();
  const files = status.files.map((entry) => entry.path);
  let hasCommits = false;
  const revList = await git.raw([
    "rev-list",
    "--count",
    `${metadata.baseCommit}..HEAD`
  ]);
  const count = Number.parseInt(revList.trim(), 10);
  if (!Number.isNaN(count) && count > 0) {
    hasCommits = true;
  }

  return { hasCommits, files, status };
}

export async function mergeChanges(
  worktreePath: string,
  targetBranch: string,
  overrides?: WorktreeOverrides
): Promise<MergeResult> {
  const deps = resolveDependencies(overrides);
  const metadata = registry.get(worktreePath);
  if (!metadata) {
    throw new Error(`Unknown worktree at ${worktreePath}`);
  }

  const summary = await getChanges(worktreePath, overrides);
  const { files, hasCommits } = summary;

  if (!hasCommits && files.length === 0) {
    return { outcome: "no-changes", files, hasCommits };
  }

  if (hasCommits) {
    const git = deps.gitFactory(metadata.root);
    try {
      await git.checkout(targetBranch);
      await git.merge(["--no-ff", metadata.branchName]);
      return { outcome: "merged", files, hasCommits };
    } catch (error) {
      return {
        outcome: "conflict",
        files,
        hasCommits,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }

  await applyWorktreeChanges({
    fs: deps.fs,
    root: metadata.root,
    worktreePath,
    status: summary.status
  });

  return { outcome: "merged", files, hasCommits };
}

async function applyWorktreeChanges(input: {
  fs: typeof nodeFs;
  root: string;
  worktreePath: string;
  status: StatusResult;
}): Promise<void> {
  const { fs, root, worktreePath, status } = input;
  const changed = new Set<string>();
  for (const file of status.modified ?? []) {
    changed.add(file);
  }
  for (const file of status.created ?? []) {
    changed.add(file);
  }
  for (const file of status.not_added ?? []) {
    changed.add(file);
  }
  for (const entry of status.renamed ?? []) {
    await removePath(fs, path.join(root, entry.from));
    changed.add(entry.to);
  }
  for (const removed of status.deleted ?? []) {
    await removePath(fs, path.join(root, removed));
    changed.delete(removed);
  }

  for (const file of changed) {
    const source = path.join(worktreePath, file);
    const destination = path.join(root, file);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    const content = await fs.readFile(source);
    await fs.writeFile(destination, content);
  }
}

async function removePath(
  fs: typeof nodeFs,
  target: string
): Promise<void> {
  if (typeof fs.rm === "function") {
    await fs.rm(target, { recursive: true, force: true }).catch(() => {});
    return;
  }
  await fs.unlink(target).catch(() => {});
}
