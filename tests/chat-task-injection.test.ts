import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PoeChatService } from "../src/services/chat.js";
import type { ToolExecutor } from "../src/services/chat.js";

describe("PoeChatService task injection", () => {
  const apiKey = "sk-test";
  const model = "gpt-test";
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      async json() {
        return {
          id: "resp_1",
          object: "chat.completion",
          created: Date.now(),
          model,
          choices: [
            {
              index: 0,
              finish_reason: "stop",
              message: {
                role: "assistant",
                content: "Hello!"
              }
            }
          ]
        };
      }
    }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("injects completed task results as system messages", async () => {
    const registry = {
      getCompletedTasks: vi.fn(() => [
        {
          id: "task_123",
          status: "completed",
          result: "Worktree merged",
          toolName: "spawn_git_worktree"
        }
      ]),
      clearCompleted: vi.fn()
    };

    const toolExecutor: ToolExecutor = {
      executeTool: vi.fn()
    };

    const chat = new PoeChatService(
      apiKey,
      model,
      toolExecutor,
      undefined,
      undefined,
      registry as unknown as any
    );

    await chat.sendMessage("Ready?");

    const history = chat.getHistory();
    expect(history[0]).toEqual(
      expect.objectContaining({
        role: "system",
        content: expect.stringContaining("task_123")
      })
    );
    expect(history[1]).toEqual(
      expect.objectContaining({
        role: "user",
        content: "Ready?"
      })
    );
    expect(registry.clearCompleted).toHaveBeenCalledTimes(1);
  });
});
