import { describe, it, expect, vi, beforeEach } from "vitest";
import { Volume, createFsFromVolume } from "memfs";

function createGitStub() {
  return {
    checkIsRepo: vi.fn(),
    revparse: vi.fn(),
    raw: vi.fn(),
    status: vi.fn(),
    log: vi.fn(),
    checkout: vi.fn(),
    merge: vi.fn()
  };
}

describe("worktree utilities", () => {
  let vol: Volume;
  let fs: any;
  let gitFactory: ReturnType<typeof vi.fn>;
  let baseGit: ReturnType<typeof createGitStub>;
  let worktreeGit: ReturnType<typeof createGitStub>;
  let tmpdirSpy: ReturnType<typeof vi.fn>;
  const basePath = "/repo";
  const worktreePath = "/tmp/poe-worktree-1700000000000-abcd";
  const branchName = "poe-worktree/1700000000000-abcd";

  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.resetModules();
    vol = new Volume();
    fs = createFsFromVolume(vol);
    baseGit = createGitStub();
    worktreeGit = createGitStub();
    gitFactory = vi.fn((cwd: string) => {
      if (cwd === worktreePath) {
        return worktreeGit;
      }
      return baseGit;
    });
    baseGit.checkIsRepo.mockResolvedValue(true);
    baseGit.revparse.mockImplementation(async (args: string[]) => {
      if (args.includes("--show-toplevel")) {
        return basePath;
      }
      if (args.includes("HEAD")) {
        return "abc123";
      }
      return "";
    });
    baseGit.raw.mockImplementation(async (args: string[]) => {
      if (args[0] === "worktree" && args[1] === "add") {
        return "";
      }
      if (args[0] === "worktree" && args[1] === "remove") {
        return "";
      }
      if (args[0] === "branch") {
        return "";
      }
      return "";
    });
    worktreeGit.status.mockResolvedValue({
      files: [{ path: "file.txt" }],
      staged: [],
      ahead: 0,
      behind: 0,
      conflicted: [],
      created: [],
      deleted: [],
      modified: [],
      renamed: [],
      isClean: false
    });
    worktreeGit.raw.mockImplementation(async (args: string[]) => {
      if (args[0] === "rev-list") {
        return "1\n";
      }
      return "";
    });
    worktreeGit.log.mockResolvedValue({
      total: 1,
      latest: { hash: "def456" },
      all: [{ hash: "def456" }]
    });
    tmpdirSpy = vi.fn(() => "/tmp");
  });

  async function loadModule() {
    return await import("../src/utils/worktree.js");
  }

  it("detects git repositories via checkIsRepo", async () => {
    const { isGitRepository } = await loadModule();
    const result = await isGitRepository(basePath, { gitFactory });
    expect(result).toBe(true);
    expect(gitFactory).toHaveBeenCalledWith(basePath);
    expect(baseGit.checkIsRepo).toHaveBeenCalled();
  });

  it("creates a worktree in tmpdir and registers metadata", async () => {
    const { createWorktree } = await loadModule();
    const context = await createWorktree(basePath, {
      fs: fs.promises,
      gitFactory,
      os: { tmpdir: tmpdirSpy },
      crypto: { randomBytes: () => Buffer.from("abcd", "hex") },
      clock: { now: () => 1700000000000 }
    } as any);
    expect(context.path).toBe(worktreePath);
    expect(context.branchName).toBe(branchName);
    expect(baseGit.raw).toHaveBeenCalledWith([
      "worktree",
      "add",
      "-b",
      branchName,
      worktreePath
    ]);
  });

  it("reports changed files and commit presence", async () => {
    const { createWorktree, getChanges } = await loadModule();
    await createWorktree(basePath, {
      fs: fs.promises,
      gitFactory,
      os: { tmpdir: tmpdirSpy },
      crypto: { randomBytes: () => Buffer.from("abcd", "hex") },
      clock: { now: () => 1700000000000 }
    } as any);
    const summary = await getChanges(worktreePath, { gitFactory });
    expect(summary.files).toEqual(["file.txt"]);
    expect(summary.hasCommits).toBe(true);
  });

  it("merges commits into target branch using --no-ff", async () => {
    const { createWorktree, mergeChanges } = await loadModule();
    await createWorktree(basePath, {
      fs: fs.promises,
      gitFactory,
      os: { tmpdir: tmpdirSpy },
      crypto: { randomBytes: () => Buffer.from("abcd", "hex") },
      clock: { now: () => 1700000000000 }
    } as any);
    baseGit.merge.mockResolvedValue({
      summary: { conflicts: [] }
    });
    const result = await mergeChanges(worktreePath, "main", {
      gitFactory,
      fs: fs.promises
    } as any);
    expect(result.outcome).toBe("merged");
    expect(baseGit.checkout).toHaveBeenCalledWith("main");
    expect(baseGit.merge).toHaveBeenCalled();
  });
});
