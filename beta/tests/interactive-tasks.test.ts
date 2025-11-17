import { beforeEach, describe, expect, it, vi } from "vitest";
import { Volume, createFsFromVolume } from "memfs";
import type { AgentTask } from "../src/services/agent-task-registry.js";
import { handleTasksCommand } from "../src/cli/interactive-tasks.js";

describe("/tasks command handler", () => {
  let vol: Volume;
  let fs: typeof import("node:fs");
  const tasksDir = "/home/.poe-code/tasks";
  const logsDir = "/home/.poe-code/logs/tasks";

  const task: AgentTask = {
    id: "task_1",
    toolName: "spawn_git_worktree",
    args: { agent: "codex", prompt: "demo" },
    status: "running",
    startTime: 1_700_000_000_000,
    logFile: `${logsDir}/task_1.log`,
    progressFile: `${tasksDir}/task_1.progress.jsonl`
  };

  beforeEach(() => {
    vol = new Volume();
    const memfs = createFsFromVolume(vol);
    fs = memfs as unknown as typeof import("node:fs");
    vol.mkdirSync(tasksDir, { recursive: true });
    vol.mkdirSync(logsDir, { recursive: true });
  });

  function createOptions(overrides?: Partial<Parameters<typeof handleTasksCommand>[1]>) {
    return {
      registry: {
        getAllTasks: () => [task],
        getTask: (id: string) => (id === task.id ? task : undefined),
        killTask: vi.fn(() => true),
        readProgress: vi.fn(),
        waitForTask: vi.fn(),
        getRunningTasks: () => [task]
      },
      fs,
      now: () => task.startTime + 5_000,
      ...overrides
    };
  }

  it("lists running tasks with statuses", async () => {
    const output = await handleTasksCommand([], createOptions());
    expect(output).toContain("task_1");
    expect(output).toContain("spawn_git_worktree");
    expect(output).toContain("running");
  });

  it("prints details for a specific task", async () => {
    const output = await handleTasksCommand(["task_1"], createOptions());
    expect(output).toContain("Args:");
    expect(output).toContain('"agent": "codex"');
    expect(output).toContain("Duration");
  });

  it("reads task logs when --logs flag is provided", async () => {
    const opts = createOptions();
    await fs.promises.writeFile(task.logFile, "[log] started\n[log] done\n", "utf8");

    const output = await handleTasksCommand(["task_1", "--logs"], opts);
    expect(output).toContain("[log] started");
    expect(output).toContain("[log] done");
  });

  it("invokes killTask when --kill is provided", async () => {
    const killTask = vi.fn(() => true);
    const output = await handleTasksCommand(
      ["task_1", "--kill"],
      createOptions({
        registry: {
          ...createOptions().registry,
          killTask
        }
      })
    );
    expect(killTask).toHaveBeenCalledWith("task_1");
    expect(output).toContain("Task task_1 terminated");
  });
});
