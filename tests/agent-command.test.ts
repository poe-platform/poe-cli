import { describe, expect, it, vi } from "vitest";
import { runAgentConversation } from "../src/cli/commands/agent.js";

function createLogger() {
  return {
    info: vi.fn(),
    error: vi.fn(),
    verbose: vi.fn(),
    dryRun: vi.fn()
  };
}

describe("runAgentConversation", () => {
  it("waits for background tasks and logs completions", async () => {
    const logger = createLogger();
    const waitForAllTasks = vi.fn(async () => {});
    const drainCompletedTasks = vi.fn(() => [
      {
        id: "task_1",
        toolName: "spawn_git_worktree",
        args: { agent: "codex" },
        status: "completed",
        startTime: 1,
        endTime: 2,
        result: "Merged successfully",
        logFile: "/logs/task_1.log",
        progressFile: "/tasks/task_1.progress.jsonl"
      }
    ]);
    const dispose = vi.fn(async () => {});
    const sendMessage = vi.fn(async () => ({ content: "Done" }));

    const chatServiceFactory = vi.fn(async (options) => {
      expect(options.awaitTasksOnDispose).toBe(true);
      return {
        sendMessage,
        waitForAllTasks,
        drainCompletedTasks,
        dispose
      };
    });

    const container = {
      env: { cwd: "/workspace", homeDir: "/home/user" },
      fs: {} as any,
      chatServiceFactory
    } as const;

    const message = await runAgentConversation({
      container: container as any,
      logger: logger as any,
      text: "Do the thing",
      model: "test-model",
      apiKey: "sk"
    });

    const [promptArg] = sendMessage.mock.calls[0] ?? [];
    expect(promptArg).toBe("Do the thing");
    expect(waitForAllTasks).toHaveBeenCalledTimes(1);
    expect(drainCompletedTasks).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining("Task task_1 finished")
    );
    expect(message).toBe("Agent response (test-model): Done");
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});
