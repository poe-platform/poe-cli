import path from "node:path";
import { fileURLToPath } from "node:url";
import * as fs from "node:fs";
import { TaskLogger } from "./task-logger.js";
import { AgentTaskRegistry } from "./agent-task-registry.js";
import type { FsLike, ProgressUpdate } from "./agent-task-registry.js";
import { DefaultToolExecutor } from "./tools.js";
import type { FileSystem } from "../utils/file-system.js";

export interface TaskRunnerOptions {
  fs: FsLike;
  tasksDir: string;
  logsDir: string;
  taskId: string;
  toolName: string;
  args: Record<string, unknown>;
  registry: Pick<AgentTaskRegistry, "getTask" | "updateTask">;
  executor: (input: {
    toolName: string;
    args: Record<string, unknown>;
    log: (message: string) => void;
    progress: (message: string) => void;
  }) => Promise<string>;
  now?: () => number;
}

export async function runTask(options: TaskRunnerOptions): Promise<void> {
  const now = options.now ?? Date.now;
  const task = options.registry.getTask(options.taskId);
  if (!task) {
    throw new Error(`Task "${options.taskId}" not found`);
  }

  const logger = new TaskLogger({
    fs: options.fs,
    filePath: path.join(options.logsDir, `${options.taskId}.log`),
    now: () => new Date(now())
  });

  const progressFile = path.join(options.tasksDir, `${options.taskId}.progress.jsonl`);
  if (!options.fs.existsSync(progressFile)) {
    options.fs.writeFileSync(progressFile, "", { encoding: "utf8" });
  }

  const writeProgress = (update: ProgressUpdate) => {
    const line = JSON.stringify(update);
    options.fs.appendFileSync(progressFile, `${line}\n`);
  };

  const startTimestamp = now();
  logger.info(`Starting ${options.toolName}`);
  writeProgress({
    type: "progress",
    message: `Starting ${options.toolName}`,
    timestamp: startTimestamp
  });

  try {
    const result = await options.executor({
      toolName: options.toolName,
      args: options.args,
      log: (message: string) => logger.info(message),
      progress: (message: string) =>
        writeProgress({
          type: "progress",
          message,
          timestamp: now()
        })
    });

    const end = now();
    options.registry.updateTask(options.taskId, {
      status: "completed",
      result,
      endTime: end
    });

    writeProgress({
      type: "complete",
      result,
      timestamp: end
    });
    logger.info(`Task completed: ${result}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const end = now();

    options.registry.updateTask(options.taskId, {
      status: "failed",
      error: message,
      endTime: end
    });

    writeProgress({
      type: "error",
      error: message,
      timestamp: end
    });
    logger.error(`Task failed: ${message}`);
  }
}

interface RunnerPayload {
  taskId: string;
  toolName: string;
  args: Record<string, unknown>;
  context: {
    cwd: string;
  };
  directories: {
    tasks: string;
    logs: string;
  };
}

function parsePayload(argv: string[]): RunnerPayload | undefined {
  const index = argv.indexOf("--payload");
  if (index === -1) {
    return undefined;
  }
  const raw = argv[index + 1];
  if (!raw) {
    throw new Error("Missing payload for task runner");
  }
  return JSON.parse(raw) as RunnerPayload;
}

async function main(): Promise<void> {
  const payload = parsePayload(process.argv);
  if (!payload) {
    return;
  }

  const fsLike = fs as unknown as FsLike;
  const nodeFileSystem = createNodeFileSystem();
  const registry = new AgentTaskRegistry({
    fs: fsLike,
    tasksDir: payload.directories.tasks,
    logsDir: payload.directories.logs
  });

  try {
    const executor = new DefaultToolExecutor({
      fs: nodeFileSystem,
      cwd: payload.context.cwd
    });

    await runTask({
      fs: fsLike,
      tasksDir: payload.directories.tasks,
      logsDir: payload.directories.logs,
      taskId: payload.taskId,
      toolName: payload.toolName,
      args: payload.args,
      registry,
      executor: async ({ toolName, args, progress }) => {
        const result = await executor.executeTool(toolName, args);
        const lines = result.split("\n").filter((line) => line.trim().length > 0);
        for (const line of lines) {
          progress(line);
        }
        return result;
      }
    });
  } finally {
    registry.dispose();
  }
}

const modulePath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(modulePath)) {
  void main().catch((error) => {
    const detail =
      error instanceof Error ? error.stack ?? error.message : String(error);
    process.stderr.write(`Task runner failed ${detail}\n`);
    process.exitCode = 1;
  });
}

function createNodeFileSystem(): FileSystem {
  const promises = fs.promises;

  function readFile(path: string, encoding: BufferEncoding): Promise<string>;
  function readFile(path: string): Promise<Buffer>;
  function readFile(path: string, encoding?: BufferEncoding) {
    if (encoding) {
      return promises.readFile(path, encoding);
    }
    return promises.readFile(path);
  }

  return {
    readFile,
    writeFile: async (path, data, options) => {
      await promises.writeFile(path, data, options);
    },
    mkdir: async (target, options) => {
      await promises.mkdir(target, options);
    },
    stat: (target) => promises.stat(target),
    unlink: (target) => promises.unlink(target),
    readdir: (target) => promises.readdir(target),
    rm: promises.rm ? ((path, options) => promises.rm(path, options)) : undefined,
    copyFile: promises.copyFile
      ? ((src, dest) => promises.copyFile(src, dest))
      : undefined,
    chmod: promises.chmod ? ((target, mode) => promises.chmod(target, mode)) : undefined
  };
}
