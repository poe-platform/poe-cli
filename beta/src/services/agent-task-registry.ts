import type { FSWatcher, Stats } from "node:fs";
import path from "node:path";

export type AgentTaskStatus = "running" | "completed" | "failed" | "killed";

export interface AgentTask {
  id: string;
  toolName: string;
  args: Record<string, unknown>;
  status: AgentTaskStatus;
  startTime: number;
  endTime?: number;
  result?: string;
  error?: string;
  logFile: string;
  progressFile: string;
  pid?: number;
  command?: string;
  worktreePath?: string;
}

export interface ProgressUpdate {
  type: "progress" | "complete" | "error";
  message?: string;
  result?: string;
  error?: string;
  timestamp: number;
}

type MinimalStats = Pick<Stats, "size" | "mtimeMs">;

export interface FsLike {
  promises: {
    mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
    readFile(path: string, encoding: BufferEncoding): Promise<string>;
    writeFile(
      path: string,
      data: string | Uint8Array,
      options?: { encoding?: BufferEncoding }
    ): Promise<void>;
    appendFile(
      path: string,
      data: string | Uint8Array,
      options?: { encoding?: BufferEncoding }
    ): Promise<void>;
    readdir(path: string): Promise<string[]>;
    stat(path: string): Promise<MinimalStats>;
    unlink(path: string): Promise<void>;
    rename(oldPath: string, newPath: string): Promise<void>;
  };
  watch(
    filename: string,
    listener: (event: string, filename: string | null) => void
  ): FSWatcher;
  existsSync(path: string): boolean;
  mkdirSync(path: string, options?: { recursive?: boolean }): void;
  readFileSync(path: string, encoding: BufferEncoding): string;
  writeFileSync(path: string, data: string, options?: { encoding?: BufferEncoding }): void;
  appendFileSync(path: string, data: string): void;
  statSync(path: string): MinimalStats;
  unlinkSync(path: string): void;
  renameSync(oldPath: string, newPath: string): void;
  readdirSync(path: string): string[];
}

export interface AgentTaskRegistryOptions {
  fs: FsLike;
  tasksDir: string;
  logsDir: string;
  now?: () => number;
  maxTasks?: number;
  archiveAfterMs?: number;
  logRetentionMs?: number;
  completionRetentionMs?: number;
  watchFactory?: (
    dir: string,
    listener: (event: string, filename: string | null) => void
  ) => FSWatcher;
  debounceMs?: number;
  logger?: (event: string, payload?: Record<string, unknown>) => void;
}

const DEFAULT_MAX_TASKS = 100;
const DAY_IN_MS = 24 * 60 * 60 * 1000;

export class AgentTaskRegistry {
  private readonly fs: FsLike;
  private readonly tasksDir: string;
  private readonly logsDir: string;
  private readonly now: () => number;
  private readonly maxTasks: number;
  private readonly archiveAfterMs: number;
  private readonly logRetentionMs: number;
  private readonly completionRetentionMs: number;
  private readonly watchFactory?: (
    dir: string,
    listener: (event: string, filename: string | null) => void
  ) => FSWatcher;
  private readonly debounceMs: number;
  private readonly logger?: (event: string, payload?: Record<string, unknown>) => void;

  private watcher?: FSWatcher;
  private readonly tasks = new Map<string, AgentTask>();
  private readonly taskOrder: string[] = [];
  private readonly completionCallbacks: Array<(task: AgentTask) => void> = [];
  private readonly progressCallbacks: Array<(taskId: string, update: ProgressUpdate) => void> =
    [];
  private readonly completedQueue: AgentTask[] = [];
  private readonly completedSet = new Set<string>();
  private readonly pendingDebounce = new Map<string, NodeJS.Timeout>();

  constructor(options: AgentTaskRegistryOptions) {
    this.fs = options.fs;
    this.tasksDir = options.tasksDir;
    this.logsDir = options.logsDir;
    this.now = options.now ?? Date.now;
    this.maxTasks = options.maxTasks ?? DEFAULT_MAX_TASKS;
    this.archiveAfterMs = options.archiveAfterMs ?? DAY_IN_MS;
    this.logRetentionMs = options.logRetentionMs ?? 7 * DAY_IN_MS;
    this.completionRetentionMs = options.completionRetentionMs ?? 30 * DAY_IN_MS;
    this.watchFactory = options.watchFactory;
    this.debounceMs = options.debounceMs ?? 100;
    this.logger = options.logger;

    this.ensureDirectories();
    this.bootstrapFromDisk();
    // Start watching AFTER loading existing tasks to avoid race conditions
    this.startWatching();
  }

  get size(): number {
    return this.tasks.size;
  }

  getTasksDirectory(): string {
    return this.tasksDir;
  }

  getLogsDirectory(): string {
    return this.logsDir;
  }

  registerTask(input: {
    toolName: string;
    args: Record<string, unknown>;
  }): string {
    const taskId = this.createTaskId();
    const startTime = this.now();
    const task: AgentTask = {
      id: taskId,
      toolName: input.toolName,
      args: { ...input.args },
      status: "running",
      startTime,
      logFile: path.join(this.logsDir, `${taskId}.log`),
      progressFile: path.join(this.tasksDir, `${taskId}.progress.jsonl`)
    };

    this.tasks.set(taskId, task);
    this.taskOrder.push(taskId);
    this.trimCache();
    this.persistTask(task);
    this.ensureFile(task.progressFile);
    this.logger?.("task_registered", {
      id: taskId,
      tool: input.toolName
    });
    return taskId;
  }

  updateTask(id: string, patch: Partial<AgentTask>): void {
    const current = this.tasks.get(id) ?? this.loadTask(id);
    if (!current) {
      throw new Error(`Unknown task "${id}"`);
    }
    const updated: AgentTask = {
      ...current,
      ...patch,
      args: current.args
    };
    this.tasks.set(id, updated);
    this.persistTask(updated);

    if (this.isTerminal(updated.status)) {
      this.enqueueCompletion(updated);
    }
  }

  getTask(id: string): AgentTask | undefined {
    return this.tasks.get(id) ?? this.loadTask(id);
  }

  getAllTasks(): AgentTask[] {
    const tasks = Array.from(this.tasks.values());
    return tasks.sort((a, b) => b.startTime - a.startTime);
  }

  getRunningTasks(): AgentTask[] {
    const running = this.getAllTasks().filter((task) => task.status === "running");
    
    // Check for zombie tasks (processes that are no longer alive)
    for (const task of running) {
      if (task.pid && !this.isProcessAlive(task.pid)) {
        this.logger?.("zombie_task_detected", {
          id: task.id,
          pid: task.pid
        });
        this.updateTask(task.id, {
          status: "failed",
          error: "Process terminated unexpectedly (zombie task)",
          endTime: this.now()
        });
      }
    }
    
    // Return only tasks that are still actually running
    return this.getAllTasks().filter((task) => task.status === "running");
  }

  getCompletedTasks(): AgentTask[] {
    return this.completedQueue.map((task) => ({ ...task }));
  }

  clearCompleted(): void {
    this.completedQueue.length = 0;
    this.completedSet.clear();
  }

  onTaskComplete(callback: (task: AgentTask) => void): void {
    this.completionCallbacks.push(callback);
  }

  onTaskProgress(callback: (taskId: string, update: ProgressUpdate) => void): void {
    this.progressCallbacks.push(callback);
  }

  killTask(id: string): boolean {
    const task = this.tasks.get(id);
    if (!task?.pid) {
      return false;
    }

    try {
      process.kill(task.pid);
      const endTime = this.now();
      const killedTask: AgentTask = {
        ...task,
        status: "killed",
        endTime
      };
      this.tasks.set(id, killedTask);
      this.persistTask(killedTask);
      this.enqueueCompletion(killedTask);
      this.logger?.("task_killed", { id });
      return true;
    } catch (error) {
      this.logger?.("task_kill_failed", {
        id,
        message: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }

  readProgress(taskId: string): ProgressUpdate[] {
    const task = this.tasks.get(taskId);
    if (!task) {
      return [];
    }
    if (!this.fs.existsSync(task.progressFile)) {
      return [];
    }
    const content = this.fs.readFileSync(task.progressFile, "utf8");
    const lines = content.split("\n").filter((line) => line.trim().length > 0);
    const updates: ProgressUpdate[] = [];
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line) as ProgressUpdate;
        updates.push(parsed);
      } catch {
        // Skip malformed lines
      }
    }
    return updates;
  }

  async waitForTask(
    id: string,
    onUpdate: (update: ProgressUpdate) => void
  ): Promise<AgentTask | undefined> {
    const existing = this.getTask(id);
    if (!existing) {
      return undefined;
    }
    if (this.isTerminal(existing.status)) {
      return existing;
    }

    return new Promise<AgentTask | undefined>((resolve) => {
      const completion = (task: AgentTask) => {
        if (task.id === id) {
          cleanup();
          resolve(task);
        }
      };
      const progress = (taskId: string, update: ProgressUpdate) => {
        if (taskId === id) {
          onUpdate(update);
        }
      };

      const cleanup = () => {
        const completionIndex = this.completionCallbacks.indexOf(completion);
        if (completionIndex !== -1) {
          this.completionCallbacks.splice(completionIndex, 1);
        }
        const progressIndex = this.progressCallbacks.indexOf(progress);
        if (progressIndex !== -1) {
          this.progressCallbacks.splice(progressIndex, 1);
        }
      };

      this.onTaskComplete(completion);
      this.onTaskProgress(progress);
    });
  }

  dispose(): void {
    this.watcher?.close();
    for (const pending of this.pendingDebounce.values()) {
      clearTimeout(pending);
    }
    this.pendingDebounce.clear();
    this.completionCallbacks.length = 0;
      this.progressCallbacks.length = 0;
      this.tasks.clear();
      this.taskOrder.length = 0;
      this.completedQueue.length = 0;
      this.completedSet.clear();
    }

  async waitForAllTasks(): Promise<void> {
    const running = this.getRunningTasks();
    if (running.length === 0) {
      return;
    }
    await Promise.all(
      running.map((task) =>
        this.waitForTask(task.id, () => {
          // No-op progress handler for waiting callers
        }).then(() => undefined)
      )
    );
  }

  private ensureDirectories(): void {
    if (!this.fs.existsSync(this.tasksDir)) {
      this.fs.mkdirSync(this.tasksDir, { recursive: true });
    }
    if (!this.fs.existsSync(this.logsDir)) {
      this.fs.mkdirSync(this.logsDir, { recursive: true });
    }
  }

  private bootstrapFromDisk(): void {
    this.loadExistingTasks();
    this.cleanupCompletedTasks();
    this.cleanupArchives();
    void this.cleanupLogs();
  }

  private loadExistingTasks(): void {
    let entries: string[] = [];
    try {
      entries = this.fs.readdirSync(this.tasksDir);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.endsWith(".json")) {
        continue;
      }
      if (entry.includes("archive")) {
        continue;
      }
      const id = entry.slice(0, entry.length - 5);
      const task = this.loadTask(id);
      if (!task) {
        continue;
      }
      this.tasks.set(id, task);
      this.taskOrder.push(id);
    }
  }

  private cleanupCompletedTasks(): void {
    const cutoff = this.now() - this.archiveAfterMs;
    const tasks = Array.from(this.tasks.values());
    for (const task of tasks) {
      if (
        task.endTime !== undefined &&
        task.endTime < cutoff &&
        (task.status === "completed" || task.status === "failed")
      ) {
        this.archiveTask(task.id);
      }
    }
  }

  private cleanupArchives(): void {
    const archiveDir = path.join(this.tasksDir, "archive");
    if (!this.fs.existsSync(archiveDir)) {
      return;
    }
    let files: string[] = [];
    try {
      files = this.fs.readdirSync(archiveDir);
    } catch {
      return;
    }
    const cutoff = this.now() - this.completionRetentionMs;
    for (const file of files) {
      const filePath = path.join(archiveDir, file);
      try {
        const stats = this.fs.statSync(filePath);
        if (stats.mtimeMs < cutoff) {
          this.fs.unlinkSync(filePath);
        }
      } catch {
        // Ignore failures
      }
    }
  }

  private async cleanupLogs(): Promise<void> {
    let files: string[] = [];
    try {
      files = await this.fs.promises.readdir(this.logsDir);
    } catch {
      return;
    }
    const cutoff = this.now() - this.logRetentionMs;
    for (const file of files) {
      if (!file.includes(".log.")) {
        continue;
      }
      const filePath = path.join(this.logsDir, file);
      try {
        const stats = await this.fs.promises.stat(filePath);
        if (stats.mtimeMs < cutoff) {
          await this.fs.promises.unlink(filePath);
        }
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  private startWatching(): void {
    const factory =
      this.watchFactory ?? this.fs.watch.bind(this.fs);
    this.watcher = factory(this.tasksDir, (event, filename) => {
      if (!filename) {
        return;
      }
      const existing = this.pendingDebounce.get(filename);
      if (existing) {
        clearTimeout(existing);
      }
      if (this.debounceMs <= 0) {
        this.pendingDebounce.delete(filename);
        this.handleFileChange(filename);
        return;
      }
      const timeout = setTimeout(() => {
        this.pendingDebounce.delete(filename);
        this.handleFileChange(filename);
      }, this.debounceMs);
      this.pendingDebounce.set(filename, timeout);
    });
  }

  private handleFileChange(filename: string): void {
    if (filename.endsWith(".json") && !filename.includes("archive")) {
      const id = filename.slice(0, filename.length - 5);
      const task = this.loadTask(id);
      if (!task) {
        return;
      }
      this.tasks.set(id, task);
      if (this.isTerminal(task.status)) {
        this.enqueueCompletion(task);
      }
      return;
    }
    if (filename.endsWith(".progress.jsonl")) {
      const id = filename.slice(0, filename.length - ".progress.jsonl".length);
      const update = this.readLatestProgress(id);
      if (!update) {
        return;
      }
      for (const callback of this.progressCallbacks) {
        callback(id, update);
      }
    }
  }

  private enqueueCompletion(task: AgentTask): void {
    if (!this.completedSet.has(task.id)) {
      this.completedSet.add(task.id);
      this.completedQueue.push(task);
    } else {
      const index = this.completedQueue.findIndex((item) => item.id === task.id);
      if (index !== -1) {
        this.completedQueue[index] = task;
      }
    }
    for (const callback of this.completionCallbacks) {
      callback(task);
    }
  }

  private readLatestProgress(taskId: string): ProgressUpdate | undefined {
    const task = this.tasks.get(taskId);
    if (!task) {
      return undefined;
    }
    if (!this.fs.existsSync(task.progressFile)) {
      return undefined;
    }
    const content = this.fs.readFileSync(task.progressFile, "utf8");
    const lines = content.split("\n").filter((line) => line.trim().length > 0);
    if (lines.length === 0) {
      return undefined;
    }
    const lastLine = lines[lines.length - 1];
    try {
      return JSON.parse(lastLine) as ProgressUpdate;
    } catch {
      return undefined;
    }
  }

  archiveTask(id: string): void {
    const archiveDir = path.join(this.tasksDir, "archive");
    if (!this.fs.existsSync(archiveDir)) {
      this.fs.mkdirSync(archiveDir, { recursive: true });
    }
    const source = path.join(this.tasksDir, `${id}.json`);
    const destination = path.join(archiveDir, `${id}.json`);
    if (this.fs.existsSync(source)) {
      try {
        this.fs.renameSync(source, destination);
      } catch {
        return;
      }
    }
    const progress = path.join(this.tasksDir, `${id}.progress.jsonl`);
    if (this.fs.existsSync(progress)) {
      try {
        this.fs.unlinkSync(progress);
      } catch {
        // ignore
      }
    }
    this.tasks.delete(id);
    const orderIndex = this.taskOrder.indexOf(id);
    if (orderIndex !== -1) {
      this.taskOrder.splice(orderIndex, 1);
    }
  }

  private trimCache(): void {
    while (this.tasks.size > this.maxTasks) {
      const oldest = this.taskOrder.shift();
      if (!oldest) {
        break;
      }
      this.tasks.delete(oldest);
    }
  }

  private ensureFile(filePath: string): void {
    if (!this.fs.existsSync(filePath)) {
      this.fs.writeFileSync(filePath, "", { encoding: "utf8" });
    }
  }

  private persistTask(task: AgentTask): void {
    const filePath = path.join(this.tasksDir, `${task.id}.json`);
    const serialized = JSON.stringify(task, null, 2);
    this.fs.writeFileSync(filePath, serialized, { encoding: "utf8" });
  }

  private loadTask(id: string): AgentTask | undefined {
    const filePath = path.join(this.tasksDir, `${id}.json`);
    if (!this.fs.existsSync(filePath)) {
      return undefined;
    }
    try {
      const raw = this.fs.readFileSync(filePath, "utf8");
      const parsed = JSON.parse(raw) as AgentTask;
      return parsed;
    } catch {
      return undefined;
    }
  }

  private createTaskId(): string {
    const timestamp = this.now();
    const random = Math.random().toString(36).slice(2, 10);
    return `task_${timestamp}_${random}`;
  }

  private isTerminal(status: AgentTaskStatus | undefined): boolean {
    return status === "completed" || status === "failed" || status === "killed";
  }

  private isProcessAlive(pid: number): boolean {
    try {
      // Signal 0 doesn't kill the process, just checks if it exists
      process.kill(pid, 0);
      return true;
    } catch (error) {
      // ESRCH means process doesn't exist
      if (error && typeof error === "object" && "code" in error && error.code === "ESRCH") {
        return false;
      }
      // EPERM means process exists but we don't have permission (still alive)
      return true;
    }
  }
}
