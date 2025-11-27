import { beforeEach, describe, expect, it, vi } from "vitest";
import { Volume, createFsFromVolume } from "memfs";
import type { AgentTask, ProgressUpdate } from "../src/services/agent-task-registry.js";
import { AgentTaskRegistry } from "../src/services/agent-task-registry.js";

interface WatchHarness {
  factory: (dir: string, listener: (event: string, filename: string | null) => void) => {
    close: () => void;
    trigger: (event: string, filename: string) => void;
  };
  watchers: Array<{
    dir: string;
    trigger: (event: string, filename: string) => void;
  }>;
}

function createWatchHarness(): WatchHarness {
  const watchers: Array<{
    dir: string;
    trigger: (event: string, filename: string) => void;
  }> = [];

  const factory = (
    dir: string,
    listener: (event: string, filename: string | null) => void
  ) => {
    watchers.push({ dir, trigger: listener });

    return {
      close: vi.fn(),
      trigger: listener
    };
  };

  return { factory, watchers };
}

describe("AgentTaskRegistry", () => {
  const tasksDir = "/home/.poe-code/tasks";
  const logsDir = "/home/.poe-code/logs/tasks";
  let vol: Volume;
  let fs: typeof import("node:fs");
  let watchHarness: WatchHarness;

  beforeEach(() => {
    vol = new Volume();
    const memfs = createFsFromVolume(vol);
    fs = memfs as unknown as typeof import("node:fs");
    vol.mkdirSync(tasksDir, { recursive: true });
    vol.mkdirSync(logsDir, { recursive: true });
    watchHarness = createWatchHarness();
  });

  function createRegistry(now = Date.now): AgentTaskRegistry {
    return new AgentTaskRegistry({
      fs,
      tasksDir,
      logsDir,
      now,
      watchFactory: watchHarness.factory,
      logger: vi.fn(),
      debounceMs: 0
    });
  }

  it("registers tasks and persists metadata", async () => {
    const now = vi.fn(() => 1_700_000_000_000);
    const registry = createRegistry(now);

    const taskId = registry.registerTask({
      toolName: "spawn_git_worktree",
      args: { agent: "codex", prompt: "demo" }
    });

    expect(taskId).toMatch(/^task_\d+/);

    const stored = JSON.parse(
      (await fs.promises.readFile(`${tasksDir}/${taskId}.json`, "utf8")).toString()
    ) as AgentTask;

    expect(stored.id).toBe(taskId);
    expect(stored.toolName).toBe("spawn_git_worktree");
    expect(stored.status).toBe("running");
    expect(stored.startTime).toBe(now());
    expect(stored.logFile).toBe(`${logsDir}/${taskId}.log`);
    expect(stored.progressFile).toBe(`${tasksDir}/${taskId}.progress.jsonl`);
  });

  it("marks tasks completed and exposes them via completed queue", async () => {
    const registry = createRegistry(() => 42);
    const taskId = registry.registerTask({
      toolName: "spawn_git_worktree",
      args: { agent: "codex", prompt: "demo" }
    });

    registry.updateTask(taskId, {
      status: "completed",
      result: "ok",
      endTime: 84
    });

    const completed = registry.getCompletedTasks();
    expect(completed).toHaveLength(1);
    expect(completed[0]?.id).toBe(taskId);
    expect(completed[0]?.result).toBe("ok");

    registry.clearCompleted();
    expect(registry.getCompletedTasks()).toHaveLength(0);
  });

  it("invokes completion callbacks when watcher detects file change", async () => {
    const registry = createRegistry(() => 100);
    const taskId = registry.registerTask({
      toolName: "spawn_git_worktree",
      args: {}
    });

    const callback = vi.fn();
    registry.onTaskComplete(callback);

    const task: AgentTask = {
      ...registry.getTask(taskId)!,
      status: "completed",
      result: "done",
      endTime: 200
    };

    await fs.promises.writeFile(
      `${tasksDir}/${taskId}.json`,
      JSON.stringify(task, null, 2),
      "utf8"
    );

    const watcher = watchHarness.watchers[watchHarness.watchers.length - 1];
    expect(watcher).toBeDefined();
    watcher.trigger("change", `${taskId}.json`);

    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({
        id: taskId,
        status: "completed",
        result: "done"
      })
    );
  });

  it("streams progress updates to listeners", async () => {
    const registry = createRegistry(() => 100);
    const taskId = registry.registerTask({
      toolName: "spawn_git_worktree",
      args: {}
    });

    const updates: ProgressUpdate[] = [];
    registry.onTaskProgress((id, update) => {
      if (id === taskId) {
        updates.push(update);
      }
    });

    const progressFile = `${tasksDir}/${taskId}.progress.jsonl`;
    await fs.promises.appendFile(
      progressFile,
      `${JSON.stringify({ type: "progress", message: "Working", timestamp: 123 })}\n`,
      "utf8"
    );

    const watcher = watchHarness.watchers[watchHarness.watchers.length - 1];
    expect(watcher).toBeDefined();
    watcher.trigger("change", `${taskId}.progress.jsonl`);

    expect(updates).toHaveLength(1);
    expect(updates[0]).toEqual({
      type: "progress",
      message: "Working",
      timestamp: 123
    });
  });

  it("archives tasks older than 24 hours on initialization", async () => {
    const cutoff = 24 * 60 * 60 * 1000;
    const oldTimestamp = 1_700_000_000_000;
    const now = vi.fn(() => oldTimestamp + cutoff + 1);

    const raw = createRegistry(() => oldTimestamp);
    const taskId = raw.registerTask({
      toolName: "spawn_git_worktree",
      args: {}
    });
    raw.updateTask(taskId, {
      status: "completed",
      result: "done",
      endTime: oldTimestamp
    });
    raw.dispose();

    const archiveDir = `${tasksDir}/archive`;
    vol.mkdirSync(archiveDir, { recursive: true });

    // Recreate registry with future time to trigger cleanup
    const registry = createRegistry(now);

    const archivePath = `${archiveDir}/${taskId}.json`;
    expect(await fs.promises.readFile(archivePath, "utf8")).toContain(taskId);
    expect(registry.getTask(taskId)).toBeUndefined();
  });

  it("trims in-memory cache to the max task limit", () => {
    const registry = createRegistry(() => 1);
    const ids = new Set<string>();

    for (let i = 0; i < 120; i++) {
      ids.add(
        registry.registerTask({
          toolName: "spawn_git_worktree",
          args: { index: i }
        })
      );
    }

    expect(registry.size).toBeLessThanOrEqual(100);
    expect(ids.size).toBe(120);
  });

  it("waits for all running tasks to complete", async () => {
    const registry = createRegistry(() => 100);
    const taskId = registry.registerTask({
      toolName: "spawn_git_worktree",
      args: {}
    });

    const waitPromise = registry.waitForAllTasks();
    registry.updateTask(taskId, {
      status: "completed",
      result: "ok",
      endTime: 200
    });

    await expect(waitPromise).resolves.toBeUndefined();
  });
});
