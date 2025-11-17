import { beforeEach, describe, expect, it, vi } from "vitest";
import { Volume, createFsFromVolume } from "memfs";
import { runTask } from "../src/services/task-runner.js";
import type { AgentTask } from "../src/services/agent-task-registry.js";

describe("Background task runner", () => {
  let vol: Volume;
  let fs: typeof import("node:fs");
  const tasksDir = "/home/.poe-code/tasks";
  const logsDir = "/home/.poe-code/logs/tasks";

  beforeEach(() => {
    vol = new Volume();
    const memfs = createFsFromVolume(vol);
    fs = memfs as unknown as typeof import("node:fs");
    vol.mkdirSync(tasksDir, { recursive: true });
    vol.mkdirSync(logsDir, { recursive: true });
  });

  it("executes the tool and updates registry with completion", async () => {
    const updates: Array<{ id: string; patch: Partial<AgentTask> }> = [];
    const taskId = "task_123";
    const result = "Worktree merged";

    const registry = {
      getTask: () =>
        ({
          id: taskId,
          toolName: "spawn_git_worktree",
          args: { agent: "codex", prompt: "demo" },
          status: "running",
          startTime: Date.now(),
          logFile: `${logsDir}/${taskId}.log`,
          progressFile: `${tasksDir}/${taskId}.progress.jsonl`
        }) satisfies AgentTask,
      updateTask: vi.fn((id: string, patch: Partial<AgentTask>) => {
        updates.push({ id, patch });
      })
    };

    await runTask({
      fs,
      tasksDir,
      logsDir,
      taskId,
      toolName: "spawn_git_worktree",
      args: { agent: "codex", prompt: "demo" },
      registry: registry as unknown as any,
      executor: async () => result,
      now: () => 1_700_000_000_000
    });

    expect(updates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: taskId,
          patch: expect.objectContaining({
            status: "completed",
            result
          })
        })
      ])
    );

    const progress = await fs.promises.readFile(
      `${tasksDir}/${taskId}.progress.jsonl`,
      "utf8"
    );
    expect(progress).toContain("\"type\":\"progress\"");
    expect(progress).toContain("\"type\":\"complete\"");
  });
});
