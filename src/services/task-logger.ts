import path from "node:path";
import type { FsLike } from "./agent-task-registry.js";

export interface TaskLoggerOptions {
  fs: FsLike;
  filePath: string;
  maxSize?: number;
  maxBackups?: number;
  now?: () => Date;
}

const DEFAULT_MAX_SIZE = 10 * 1024 * 1024;
const DEFAULT_MAX_BACKUPS = 3;

export class TaskLogger {
  private readonly fs: FsLike;
  private readonly filePath: string;
  private readonly maxSize: number;
  private readonly maxBackups: number;
  private readonly now: () => Date;

  constructor(options: TaskLoggerOptions) {
    this.fs = options.fs;
    this.filePath = options.filePath;
    this.maxSize = options.maxSize ?? DEFAULT_MAX_SIZE;
    this.maxBackups = options.maxBackups ?? DEFAULT_MAX_BACKUPS;
    this.now = options.now ?? (() => new Date());

    this.ensureDirectory();
  }

  info(message: string): void {
    this.write("INFO", message);
  }

  error(message: string): void {
    this.write("ERROR", message);
  }

  debug(message: string): void {
    this.write("DEBUG", message);
  }

  private write(level: string, message: string): void {
    this.rotateIfNeeded();
    const timestamp = this.now().toISOString();
    const line = `[${timestamp}] TASK ${level} ${message}\n`;
    this.fs.appendFileSync(this.filePath, line);
  }

  private rotateIfNeeded(): void {
    if (!this.fs.existsSync(this.filePath)) {
      return;
    }
    const stats = this.fs.statSync(this.filePath);
    if (stats.size < this.maxSize) {
      return;
    }
    this.performRotation();
  }

  private performRotation(): void {
    if (this.maxBackups < 1) {
      this.fs.unlinkSync(this.filePath);
      return;
    }

    const oldestIndex = this.maxBackups;
    const oldestPath = this.buildBackupPath(oldestIndex);
    if (this.fs.existsSync(oldestPath)) {
      this.fs.unlinkSync(oldestPath);
    }

    for (let index = this.maxBackups - 1; index >= 1; index--) {
      const source = this.buildBackupPath(index);
      if (!this.fs.existsSync(source)) {
        continue;
      }
      const target = this.buildBackupPath(index + 1);
      this.fs.renameSync(source, target);
    }

    if (this.fs.existsSync(this.filePath)) {
      this.fs.renameSync(this.filePath, this.buildBackupPath(1));
    }
  }

  private ensureDirectory(): void {
    const directory = path.dirname(this.filePath);
    if (!this.fs.existsSync(directory)) {
      this.fs.mkdirSync(directory, { recursive: true });
    }
    if (!this.fs.existsSync(this.filePath)) {
      this.fs.writeFileSync(this.filePath, "", { encoding: "utf8" });
    }
  }

  private buildBackupPath(index: number): string {
    return `${this.filePath}.${index}`;
  }
}
