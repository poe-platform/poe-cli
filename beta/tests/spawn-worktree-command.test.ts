import { describe, it, expect, vi } from "vitest";

describe("spawn worktree command", () => {
  const basePath = "/repo";
  const worktreePath = "/tmp/worktree";

  async function loadCommand() {
    return await import("../src/commands/spawn-worktree.js");
  }

  it("spawns agent in worktree and cleans up after merge", async () => {
    const context = {
      path: worktreePath,
      branchName: "poe-worktree/test",
      cleanup: vi.fn()
    };
    const runAgent = vi.fn(async () => ({
      exitCode: 0,
      stdout: "",
      stderr: ""
    }));
    const dependencies = {
      isGitRepository: vi.fn().mockResolvedValue(true),
      createWorktree: vi.fn().mockResolvedValue(context),
      getChanges: vi.fn().mockResolvedValue({
        hasCommits: true,
        files: ["changed.ts"]
      }),
      mergeChanges: vi.fn().mockResolvedValue({
        outcome: "merged",
        files: [],
        hasCommits: true
      })
    };
    const { spawnGitWorktree } = await loadCommand();
    await spawnGitWorktree({
      agent: "codex",
      prompt: "Implement feature",
      agentArgs: ["--foo"],
      basePath,
      targetBranch: "main",
      runAgent,
      logger: vi.fn(),
      dependencies
    });

    expect(runAgent).toHaveBeenCalledWith({
      agent: "codex",
      prompt: "Implement feature",
      args: ["--foo"],
      cwd: worktreePath
    });
    expect(dependencies.mergeChanges).toHaveBeenCalledWith(
      worktreePath,
      "main"
    );
    expect(context.cleanup).toHaveBeenCalledTimes(1);
  });

  it("reuses agent to resolve conflicts", async () => {
    const context = {
      path: worktreePath,
      branchName: "poe-worktree/test",
      cleanup: vi.fn()
    };
    const runAgent = vi
      .fn()
      .mockResolvedValueOnce({ exitCode: 0, stdout: "", stderr: "" })
      .mockResolvedValueOnce({ exitCode: 0, stdout: "", stderr: "" });
    const dependencies = {
      isGitRepository: vi.fn().mockResolvedValue(true),
      createWorktree: vi.fn().mockResolvedValue(context),
      getChanges: vi.fn().mockResolvedValue({
        hasCommits: false,
        files: ["conflict.ts"]
      }),
      mergeChanges: vi
        .fn()
        .mockResolvedValueOnce({
          outcome: "conflict",
          files: ["conflict.ts"],
          hasCommits: false
        })
        .mockResolvedValueOnce({
          outcome: "merged",
          files: [],
          hasCommits: false
        })
    };
    const logger = vi.fn();

    const { spawnGitWorktree } = await loadCommand();
    await spawnGitWorktree({
      agent: "codex",
      prompt: "Implement feature",
      agentArgs: [],
      basePath,
      targetBranch: "main",
      runAgent,
      logger,
      dependencies
    });

    expect(runAgent).toHaveBeenNthCalledWith(1, {
      agent: "codex",
      prompt: "Implement feature",
      args: [],
      cwd: worktreePath
    });
    expect(runAgent).toHaveBeenNthCalledWith(2, {
      agent: "codex",
      prompt:
        "Merge conflicts in: conflict.ts. Resolve using git commands.",
      args: [],
      cwd: worktreePath
    });
    expect(context.cleanup).toHaveBeenCalledTimes(1);
  });

  it("keeps worktree on agent failure", async () => {
    const context = {
      path: worktreePath,
      branchName: "poe-worktree/test",
      cleanup: vi.fn()
    };
    const runAgent = vi.fn().mockResolvedValue({
      exitCode: 1,
      stdout: "",
      stderr: "error"
    });
    const dependencies = {
      isGitRepository: vi.fn().mockResolvedValue(true),
      createWorktree: vi.fn().mockResolvedValue(context),
      getChanges: vi.fn(),
      mergeChanges: vi.fn()
    };
    const logger = vi.fn();
    const { spawnGitWorktree } = await loadCommand();
    await expect(
      spawnGitWorktree({
        agent: "codex",
        prompt: "Implement feature",
        agentArgs: [],
        basePath,
        targetBranch: "main",
        runAgent,
        logger,
        dependencies
      })
    ).rejects.toThrow("Agent execution failed");

    expect(logger).toHaveBeenCalledWith(
      expect.stringContaining("Worktree preserved at")
    );
    expect(context.cleanup).not.toHaveBeenCalled();
  });
});
