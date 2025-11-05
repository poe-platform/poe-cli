import { describe, it, expect, beforeEach, vi } from "vitest";
import { Volume, createFsFromVolume } from "memfs";
import type { FileSystem } from "../src/utils/file-system.js";
import { AgentConfigManager } from "../src/services/agent-config-manager.js";
import { createDefaultAgentRegistry } from "../src/services/agent-registry.js";

const spawnGitWorktreeMock = vi.hoisted(() => vi.fn());
const spawnCodexMock = vi.hoisted(() =>
  vi.fn(async () => ({
    exitCode: 0,
    stdout: "",
    stderr: ""
  }))
);

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
  let agentConfigManager: AgentConfigManager;
  const homeDir = "/home/user";

  beforeEach(async () => {
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
    vol.mkdirSync(homeDir, { recursive: true });
    const registry = createDefaultAgentRegistry();
    agentConfigManager = new AgentConfigManager({
      fs,
      homeDir,
      registry
    });
    await agentConfigManager.loadConfig();
  });

  it("executes synchronously by default even when async infrastructure is available", async () => {
    const { DefaultToolExecutor } = await import("../src/services/tools.js");
    const registerTask = vi.fn(() => "task_1");
    const getTask = vi.fn(() => ({
      id: "task_1",
      toolName: "spawn_git_worktree",
      args: {
        agent: "codex",
        prompt: "Implement feature",
        agentArgs: ["--verbose"]
      },
      status: "running",
      startTime: 1,
      logFile: "/logs/task_1.log",
      progressFile: "/tasks/task_1.progress.jsonl"
    }));
    const background = vi.fn();

    const registry = createDefaultAgentRegistry();
    const executor = new DefaultToolExecutor({
      fs,
      cwd: "/repo",
      taskRegistry: {
        registerTask,
        getTask,
        updateTask: vi.fn(),
        onTaskComplete: vi.fn(),
        onTaskProgress: vi.fn(),
        getCompletedTasks: () => [],
        clearCompleted: vi.fn()
      } as unknown as any,
      spawnBackgroundTask: background,
      agentRegistry: registry,
      agentConfigManager,
      homeDir
    });

    const result = await executor.executeTool("spawn_git_worktree", {
      agent: "codex",
      prompt: "Implement feature",
      agentArgs: ["--verbose"]
    });

    expect(background).not.toHaveBeenCalled();
    expect(registerTask).not.toHaveBeenCalled();
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

  it("registers an async task and starts the background runner when async option is true", async () => {
    const { DefaultToolExecutor } = await import("../src/services/tools.js");
    const registerTask = vi.fn(() => "task_1");
    const getTask = vi.fn(() => ({
      id: "task_1",
      toolName: "spawn_git_worktree",
      args: {
        agent: "codex",
        prompt: "Implement feature",
        agentArgs: ["--verbose"]
      },
      status: "running",
      startTime: 1,
      logFile: "/logs/task_1.log",
      progressFile: "/tasks/task_1.progress.jsonl"
    }));
    const background = vi.fn();

    const registry = createDefaultAgentRegistry();
    const executor = new DefaultToolExecutor({
      fs,
      cwd: "/repo",
      taskRegistry: {
        registerTask,
        getTask,
        updateTask: vi.fn(),
        onTaskComplete: vi.fn(),
        onTaskProgress: vi.fn(),
        getCompletedTasks: () => [],
        clearCompleted: vi.fn()
      } as unknown as any,
      spawnBackgroundTask: background,
      agentRegistry: registry,
      agentConfigManager,
      homeDir
    });

    const result = await executor.executeTool("spawn_git_worktree", {
      agent: "codex",
      prompt: "Implement feature",
      agentArgs: ["--verbose"],
      async: true
    });

    expect(registerTask).toHaveBeenCalledWith({
      toolName: "spawn_git_worktree",
      args: {
        agent: "codex",
        prompt: "Implement feature",
        agentArgs: ["--verbose"],
        async: true
      }
    });
    expect(background).toHaveBeenCalledWith({
      taskId: "task_1",
      toolName: "spawn_git_worktree",
      args: {
        agent: "codex",
        prompt: "Implement feature",
        agentArgs: ["--verbose"],
        async: true
      },
      context: {
        cwd: "/repo"
      }
    });
    expect(result).toContain("Started background task task_1");
    expect(spawnGitWorktreeMock).not.toHaveBeenCalled();
  });

  it("falls back to synchronous execution when async infrastructure unavailable", async () => {
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
