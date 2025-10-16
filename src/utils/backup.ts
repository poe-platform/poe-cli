import path from "node:path";
import type { FileSystem } from "./file-system.js";

type TimestampProvider = () => string;

const DEFAULT_TIMESTAMP: TimestampProvider = () =>
  new Date().toISOString().replace(/[:.]/g, "-");

export async function createBackup(
  fs: FileSystem,
  targetPath: string,
  timestamp: TimestampProvider = DEFAULT_TIMESTAMP
): Promise<string | null> {
  if (!(await exists(fs, targetPath))) {
    return null;
  }

  const backupPath = `${targetPath}.backup.${timestamp()}`;
  await copy(fs, targetPath, backupPath);
  return backupPath;
}

export async function restoreLatestBackup(
  fs: FileSystem,
  targetPath: string
): Promise<boolean> {
  const dir = path.dirname(targetPath);
  const base = path.basename(targetPath);

  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch (error) {
    if (isNotFound(error)) {
      return false;
    }
    throw error;
  }

  const backups = entries
    .filter((name) => name.startsWith(`${base}.backup.`))
    .sort()
    .reverse();

  if (backups.length === 0) {
    return false;
  }

  const latest = path.join(dir, backups[0]);
  await copy(fs, latest, targetPath);
  return true;
}

async function exists(fs: FileSystem, targetPath: string): Promise<boolean> {
  try {
    await fs.stat(targetPath);
    return true;
  } catch (error) {
    if (isNotFound(error)) {
      return false;
    }
    throw error;
  }
}

async function copy(
  fs: FileSystem,
  from: string,
  to: string
): Promise<void> {
  if (typeof fs.copyFile === "function") {
    await fs.copyFile(from, to);
    return;
  }
  const content = await fs.readFile(from);
  await fs.writeFile(to, content);
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "ENOENT"
  );
}
