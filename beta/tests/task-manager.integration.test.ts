import { describe, expect, it, vi } from "vitest";
import { Command } from "commander";
import path from "node:path";
import os from "node:os";
import * as nodeFs from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { EventEmitter } from "node:events";
import type { FSWatcher } from "node:fs";
import { createCliContainer } from "../src/cli/container.js";
import { registerSpawnCommand } from "poe-code/dist/cli/commands/spawn.js";
import type {
  ProviderService,
  ProviderContext
} from "../src/cli/service-registry.js";
import type { CommandRunner, CommandRunnerResult } from "../src/utils/prerequisites.js";
import {
  AgentTaskRegistry,
  type FsLike
} from "../src/services/agent-task-registry.js";
import type { FileSystem } from "../src/utils/file-system.js";

interface TaskRun {
  id: string;
  complete(resultText: string): CommandRunnerResult;
  fail(errorText: string): CommandRunnerResult;
}

interface MockSpawnHandlerInput {
  context: ProviderContext;
  options: { prompt: string; args: string[] };
  beginTask: (toolName: string, args: Record<string, unknown>, message: string) => TaskRun;
  runCommand: CommandRunner;
}

type MockSpawnHandler = (input: MockSpawnHandlerInput) => Promise<CommandRunnerResult | void>;

interface IntegrationEnv {
  spawn(service: string, prompt: string, args?: string[]): Promise<void>;
  registerProvider(name: string, handler: MockSpawnHandler): void;
  lastTaskId(): string | undefined;
  readTask(taskId: string): Promise<{
    status: string;
    result?: string;
    error?: string;
    args: Record<string, unknown>;
  }>;
  readProgress(taskId: string): Promise<Array<Record<string, unknown>>>;
  registry: AgentTaskRegistry;
  dispose(): Promise<void>;
}

async function setupEnvironment(options?: {
  commandRunner?: CommandRunner;
}): Promise<IntegrationEnv> {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "poe-task-"));
  const homeDir = path.join(tempRoot, "home");
  const cwd = path.join(tempRoot, "workspace");
  await mkdir(homeDir, { recursive: true });
  await mkdir(cwd, { recursive: true });

  const tasksDir = path.join(homeDir, ".poe-code", "tasks");
  const logsDir = path.join(homeDir, ".poe-code", "logs", "tasks");
  const createWatcher = (): FSWatcher => {
    const emitter = new EventEmitter();
    const watcher = emitter as unknown as FSWatcher & {
      close(): void;
      ref(): FSWatcher;
      unref(): FSWatcher;
    };
    watcher.close = () => {
      emitter.removeAllListeners();
    };
    watcher.ref = () => watcher;
    watcher.unref = () => watcher;
    return watcher;
  };
  const taskRegistry = new AgentTaskRegistry({
    fs: nodeFs as unknown as FsLike,
    tasksDir,
    logsDir,
    logger: () => {},
    watchFactory: createWatcher
  });

  const defaultRunner: CommandRunner = vi.fn(async (command, args) => ({
    stdout: [command, ...(args ?? [])].join(" "),
    stderr: "",
    exitCode: 0
  }));

  const container = createCliContainer({
    fs: nodeFs.promises as unknown as FileSystem,
    prompts: async () => ({}),
    env: {
      cwd,
      homeDir,
      platform: process.platform,
      variables: process.env
    },
    logger: () => {},
    commandRunner: options?.commandRunner ?? defaultRunner
  });

  const program = new Command();
  program.exitOverride();
  registerSpawnCommand(program, container);

  const taskIds: string[] = [];

  const appendProgress = (taskId: string, entry: Record<string, unknown>) => {
    const progressPath = path.join(tasksDir, `${taskId}.progress.jsonl`);
    nodeFs.appendFileSync(progressPath, `${JSON.stringify(entry)}\n`, "utf8");
  };

  const beginTask = (
    toolName: string,
    args: Record<string, unknown>,
    message: string
  ): TaskRun => {
    const taskId = taskRegistry.registerTask({
      toolName,
      args
    });
    taskIds.push(taskId);
    appendProgress(taskId, {
      type: "progress",
      message,
      timestamp: Date.now()
    });
    return {
      id: taskId,
      complete(resultText: string) {
        taskRegistry.updateTask(taskId, {
          status: "completed",
          result: resultText,
          endTime: Date.now()
        });
        appendProgress(taskId, {
          type: "complete",
          result: resultText,
          timestamp: Date.now()
        });
        return {
          exitCode: 0,
          stdout: resultText,
          stderr: ""
        };
      },
      fail(errorText: string) {
        taskRegistry.updateTask(taskId, {
          status: "failed",
          error: errorText,
          endTime: Date.now()
        });
        appendProgress(taskId, {
          type: "error",
          error: errorText,
          timestamp: Date.now()
        });
        return {
          exitCode: 1,
          stdout: "",
          stderr: errorText
        };
      }
    };
  };

  const registerProvider = (name: string, handler: MockSpawnHandler) => {
    const adapter: ProviderService = {
      id: name,
      summary: name,
      configureMutations: [],
      removeMutations: [],
      async configure() {},
      async remove() {
        return false;
      },
      name,
      label: name,
      resolvePaths: () => ({}),
      async spawn(context, options) {
        return await handler({
          context,
          options,
          beginTask,
          runCommand: context.command.runCommand
        });
      }
    };
    container.registry.register(adapter);
  };

  const spawn = async (service: string, prompt: string, args: string[] = []) => {
    await program.parseAsync(["spawn", service, prompt, ...args], {
      from: "user"
    });
  };

  const readTask = async (taskId: string) => {
    const filePath = path.join(tasksDir, `${taskId}.json`);
    const raw = await nodeFs.promises.readFile(filePath, "utf8");
    return JSON.parse(raw) as {
      status: string;
      result?: string;
      error?: string;
      args: Record<string, unknown>;
    };
  };

  const readProgress = async (taskId: string) => {
    const filePath = path.join(tasksDir, `${taskId}.progress.jsonl`);
    if (!nodeFs.existsSync(filePath)) {
      return [];
    }
    const raw = (await nodeFs.promises.readFile(filePath, "utf8")).trim();
    if (!raw) {
      return [];
    }
    return raw.split("\n").map((line) => JSON.parse(line) as Record<string, unknown>);
  };

  const dispose = async () => {
    taskRegistry.dispose();
    await rm(tempRoot, { recursive: true, force: true });
  };

  return {
    spawn,
    registerProvider,
    lastTaskId: () => taskIds.at(-1),
    readTask,
    readProgress,
    registry: taskRegistry,
    dispose
  };
}

describe("task manager integration", () => {
  it("records successful task progress and result", async () => {
    const env = await setupEnvironment();
    try {
      env.registerProvider("mock-success", async ({ beginTask, options, runCommand }) => {
        const task = beginTask(
          "mock_agent_success",
          { prompt: options.prompt, args: options.args },
          "Mock agent executing"
        );
        await runCommand("bash", ["-lc", `echo ${options.prompt}`]);
        return task.complete(`Mock agent says: ${options.prompt}`);
      });

      await env.spawn("mock-success", "hello");

      const taskId = env.lastTaskId();
      expect(taskId).toBeDefined();
      const record = await env.readTask(taskId!);
      expect(record.status).toBe("completed");
      expect(record.result).toBe("Mock agent says: hello");
      expect(record.args.prompt).toBe("hello");

      const entries = await env.readProgress(taskId!);
      expect(entries.map((entry) => entry.type)).toEqual(["progress", "complete"]);

      const completed = env.registry.getCompletedTasks();
      expect(completed).toHaveLength(1);
      env.registry.clearCompleted();
      expect(env.registry.getCompletedTasks()).toHaveLength(0);
    } finally {
      await env.dispose();
    }
  });

  it("captures failure state and surfaces task errors", async () => {
    const env = await setupEnvironment({
      commandRunner: vi.fn(async (command, args) => {
        if (
          command === "bash" &&
          typeof args?.[1] === "string" &&
          args[1].includes("raise-error")
        ) {
          return { stdout: "about to fail", stderr: "error", exitCode: 1 };
        }
        return { stdout: "", stderr: "", exitCode: 0 };
      })
    });

    try {
      env.registerProvider("mock-failure", async ({ beginTask, options, runCommand }) => {
        const task = beginTask(
          "mock_agent_failure",
          { prompt: options.prompt, args: options.args },
          "Mock agent error executing"
        );
        await runCommand("bash", ["-lc", "echo boom && raise-error"]);
        return task.fail("Simulated failure");
      });

      await expect(env.spawn("mock-failure", "fail")).rejects.toThrow(
        /failed with exit code 1/i
      );

      const taskId = env.lastTaskId();
      expect(taskId).toBeDefined();
      const record = await env.readTask(taskId!);
      expect(record.status).toBe("failed");
      expect(record.error).toBe("Simulated failure");

      const entries = await env.readProgress(taskId!);
      expect(entries.map((entry) => entry.type)).toEqual(["progress", "error"]);

      const completed = env.registry.getCompletedTasks();
      expect(completed.some((task) => task.status === "failed")).toBe(true);
      env.registry.clearCompleted();
      expect(env.registry.getCompletedTasks()).toHaveLength(0);
    } finally {
      await env.dispose();
    }
  });
});
