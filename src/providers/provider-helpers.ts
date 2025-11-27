import type { FileSystem } from "../utils/file-system.js";
import type { JsonObject } from "../utils/json.js";
import { isJsonObject } from "../utils/json.js";

export function quoteSinglePath(targetPath: string): string {
  const escaped = targetPath.replace(/'/g, `'\\''`);
  return `'${escaped}'`;
}

export async function readFileIfExists(
  fs: FileSystem,
  targetPath: string
): Promise<string | null> {
  try {
    return await fs.readFile(targetPath, "utf8");
  } catch (error) {
    if (isNotFound(error)) {
      return null;
    }
    throw error;
  }
}

export async function readJsonFile(
  fs: FileSystem,
  targetPath: string
): Promise<{ data: JsonObject; raw: string | null }> {
  const raw = await readFileIfExists(fs, targetPath);
  if (raw == null) {
    return { data: {}, raw: null };
  }
  try {
    const parsed = JSON.parse(raw);
    if (!isJsonObject(parsed)) {
      throw new Error("Expected JSON object.");
    }
    return { data: parsed, raw };
  } catch {
    await backupInvalidJsonDocument(fs, targetPath, raw);
    return { data: {}, raw: null };
  }
}

export async function writeJsonFile(
  fs: FileSystem,
  targetPath: string,
  value: JsonObject,
  previous?: string | null
): Promise<boolean> {
  const content = serializeJson(value);
  if (previous === content) {
    return false;
  }
  await fs.writeFile(targetPath, content, { encoding: "utf8" });
  return true;
}

export async function makeExecutable(
  fs: FileSystem,
  targetPath: string,
  mode = 0o700
): Promise<void> {
  if (typeof fs.chmod === "function") {
    await fs.chmod(targetPath, mode);
  }
}

export async function removeFileIfExists(
  fs: FileSystem,
  targetPath: string
): Promise<boolean> {
  try {
    await fs.unlink(targetPath);
    return true;
  } catch (error) {
    if (isNotFound(error)) {
      return false;
    }
    throw error;
  }
}

function serializeJson(value: JsonObject): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function backupInvalidJsonDocument(
  fs: FileSystem,
  targetPath: string,
  content: string
): Promise<void> {
  const backupPath = `${targetPath}.invalid-${createTimestamp()}.json`;
  await fs.writeFile(backupPath, content, { encoding: "utf8" });
}

function createTimestamp(): string {
  return new Date()
    .toISOString()
    .replaceAll(":", "-")
    .replaceAll(".", "-");
}

function isNotFound(error: unknown): error is NodeJS.ErrnoException {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "ENOENT"
  );
}
