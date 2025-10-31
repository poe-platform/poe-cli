import type {
  AgentTask,
  AgentTaskRegistry,
  FsLike,
  ProgressUpdate
} from "../services/agent-task-registry.js";

export interface TasksCommandOptions {
  registry: Pick<
    AgentTaskRegistry,
    | "getAllTasks"
    | "getTask"
    | "readProgress"
    | "killTask"
    | "waitForTask"
    | "getRunningTasks"
  >;
  fs: FsLike;
  now: () => number;
}

interface ParsedArgs {
  id?: string;
  flags: {
    logs: boolean;
    follow: boolean;
    kill: boolean;
  };
}

export async function handleTasksCommand(
  args: string[],
  options: TasksCommandOptions
): Promise<string> {
  const parsed = parseArgs(args);
  if (!parsed.id) {
    return renderTaskList(options.registry.getAllTasks(), options.now);
  }

  const task = options.registry.getTask(parsed.id);
  if (!task) {
    return `Task ${parsed.id} not found.`;
  }

  if (parsed.flags.kill) {
    const killed = await Promise.resolve(options.registry.killTask(parsed.id));
    return killed
      ? `Task ${parsed.id} terminated.`
      : `Unable to terminate task ${parsed.id}.`;
  }

  if (parsed.flags.logs) {
    return await renderTaskLogs(task, options.fs);
  }

  if (parsed.flags.follow) {
    return await renderTaskFollow(task, options);
  }

  return renderTaskDetails(task, options.now, options.registry.getRunningTasks());
}

function parseArgs(args: string[]): ParsedArgs {
  const result: ParsedArgs = {
    flags: {
      logs: false,
      follow: false,
      kill: false
    }
  };
  for (const arg of args) {
    if (arg === "--logs") {
      result.flags.logs = true;
      continue;
    }
    if (arg === "--follow") {
      result.flags.follow = true;
      continue;
    }
    if (arg === "--kill") {
      result.flags.kill = true;
      continue;
    }
    if (!result.id) {
      result.id = arg;
    }
  }
  return result;
}

function renderTaskList(tasks: AgentTask[], now: () => number): string {
  if (tasks.length === 0) {
    return "No background tasks recorded.";
  }

  const lines: string[] = [];
  lines.push("Background tasks:");
  for (const task of tasks) {
    const endTime = task.endTime ?? now();
    const duration = formatDuration(endTime - task.startTime);
    lines.push(
      `- ${task.id} • ${task.toolName} • ${task.status} • ${duration}`
    );
  }
  return lines.join("\n");
}

function renderTaskDetails(
  task: AgentTask,
  now: () => number,
  running: AgentTask[]
): string {
  const endTime = task.endTime ?? now();
  const duration = formatDuration(endTime - task.startTime);
  const sections: string[] = [];
  sections.push(`Task: ${task.id}`);
  sections.push(`Tool: ${task.toolName}`);
  sections.push(`Status: ${task.status}`);
  sections.push(`Started: ${new Date(task.startTime).toISOString()}`);
  sections.push(`Duration: ${duration}`);
  if (task.pid) {
    sections.push(`PID: ${task.pid}`);
  }
  sections.push("Args:");
  sections.push(JSON.stringify(task.args, null, 2));
  if (task.result) {
    sections.push("");
    sections.push("Result:");
    sections.push(task.result);
  }
  if (task.error) {
    sections.push("");
    sections.push("Error:");
    sections.push(task.error);
  }
  const runningIds = running.filter((item) => item.status === "running").map((item) => item.id);
  if (runningIds.length > 0) {
    sections.push("");
    sections.push("Running tasks:");
    sections.push(runningIds.join(", "));
  }
  return sections.join("\n");
}

async function renderTaskLogs(task: AgentTask, fs: FsLike): Promise<string> {
  if (!fs.existsSync(task.logFile)) {
    return `No logs available for ${task.id}.`;
  }
  const content = await fs.promises.readFile(task.logFile, "utf8");
  return `Logs for ${task.id}:\n${content}`;
}

async function renderTaskFollow(
  task: AgentTask,
  options: TasksCommandOptions
): Promise<string> {
  const updates = options.registry.readProgress(task.id);
  const lines: string[] = ["Progress:"];
  for (const update of updates) {
    lines.push(formatProgressLine(update));
  }

  if (task.status === "running") {
    lines.push("");
    lines.push("Waiting for task to complete...");
    const resolved = await options.registry.waitForTask(
      task.id,
      (update) => lines.push(formatProgressLine(update))
    );
    if (resolved) {
      lines.push("");
      lines.push(
        resolved.result
          ? `Completed: ${resolved.result}`
          : resolved.error
          ? `Failed: ${resolved.error}`
          : "Task finished."
      );
    }
  }

  return lines.join("\n");
}

function formatProgressLine(update: ProgressUpdate): string {
  const timestamp = new Date(update.timestamp).toISOString();
  if (update.type === "progress") {
    return `[${timestamp}] ${update.message ?? ""}`;
  }
  if (update.type === "complete") {
    return `[${timestamp}] ✅ ${update.result ?? "Done"}`;
  }
  return `[${timestamp}] ❌ ${update.error ?? "Failed"}`;
}

function formatDuration(input: number): string {
  if (input < 0) {
    return "0s";
  }
  const seconds = Math.floor(input / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    const remainder = seconds - minutes * 60;
    return `${minutes}m ${remainder}s`;
  }
  const hours = Math.floor(minutes / 60);
  const remainderMinutes = minutes - hours * 60;
  return `${hours}h ${remainderMinutes}m`;
}
