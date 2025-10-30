import { describe, it, expect, beforeEach, vi } from "vitest";
import { Volume, createFsFromVolume } from "memfs";
import type { FileSystem } from "../src/utils/file-system.js";

const spawnGitWorktreeMock = vi.fn();
const spawnCodexMock = vi.fn(async () => ({
  exitCode: 0,
  stdout: "",
  stderr: ""
}));

vi.mock("../src/commands/spawn-worktree.js", () => ({
  spawnGitWorktree: spawnGitWorktreeMock
}));

vi.mock("../src/services/codex.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../src/services/codex.js")>();
  return {
    ...original,
    spawnCodex: spawnCodexMock
  };
});

vi.mock("../src/services/claude-code.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../src/services/claude-code.js")>();
  return {
    ...original,
    spawnClaudeCode: vi.fn(async () => ({
      exitCode: 0,
      stdout: "",
      stderr: ""
    }))
  };
});

vi.mock("../src/services/opencode.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../src/services/opencode.js")>();
  return {
    ...original,
    spawnOpenCode: vi.fn(async () => ({
      exitCode: 0,
      stdout: "",
      stderr: ""
    }))
  };
});

const simpleGitStub = vi.fn(() => ({
  revparse: vi.fn(async () => "main")
}));

vi.mock("simple-git", () => ({
  simpleGit: simpleGitStub
}));

describe("worktree tool", () => {
  let fs: FileSystem;
  let vol: Volume;

  beforeEach(() => {
    spawnGitWorktreeMock.mockImplementation(async (options) => {
      await options.runAgent({
        agent: options.agent,
        prompt: options.prompt,
        args: options.agentArgs,
        cwd: `${options.basePath}/worktree`
      });
      options.logger("Worktree workflow completed.");
      return;
    });
    spawnGitWorktreeMock.mockClear();
    spawnCodexMock.mockClear();
    simpleGitStub.mockClear();
    vol = new Volume();
    const memfs = createFsFromVolume(vol);
    fs = memfs.promises as unknown as FileSystem;
    vol.mkdirSync("/repo", { recursive: true });
  });

  it("invokes spawnGitWorktree with provided options", async () => {
    const { DefaultToolExecutor } = await import("../src/services/tools.js");
    const executor = new DefaultToolExecutor({
      fs,
      cwd: "/repo"
    });

    const result = await executor.executeTool("spawn_git_worktree", {
      agent: "codex",
      prompt: "Implement feature",
      agentArgs: ["--verbose"]
    });

    expect(spawnGitWorktreeMock).toHaveBeenCalledTimes(1);
    const invocation = spawnGitWorktreeMock.mock.calls[0][0];
    expect(invocation.agent).toBe("codex");
    expect(invocation.prompt).toBe("Implement feature");
    expect(invocation.agentArgs).toEqual(["--verbose"]);
    expect(typeof invocation.runAgent).toBe("function");
    expect(result).toContain("Worktree workflow completed.");
    expect(spawnCodexMock).toHaveBeenCalledWith({
      prompt: "Implement feature",
      args: ["--verbose"],
      runCommand: expect.any(Function)
    });
  });
});
