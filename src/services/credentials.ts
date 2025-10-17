import path from "node:path";
import type { FileSystem } from "../utils/file-system.js";

export interface CredentialsStoreOptions {
  fs: FileSystem;
  filePath: string;
}

export interface SaveCredentialsOptions extends CredentialsStoreOptions {
  apiKey: string;
}

export async function saveCredentials(
  options: SaveCredentialsOptions
): Promise<void> {
  const { fs, filePath, apiKey } = options;
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const payload = JSON.stringify({ apiKey }, null, 2);
  await fs.writeFile(`${filePath}`, `${payload}\n`, { encoding: "utf8" });
}

export async function loadCredentials(
  options: CredentialsStoreOptions
): Promise<string | null> {
  const { fs, filePath } = options;
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as { apiKey?: unknown };
    if (typeof parsed.apiKey === "string" && parsed.apiKey.length > 0) {
      return parsed.apiKey;
    }
    return null;
  } catch (error) {
    if (isNotFound(error)) {
      return null;
    }
    throw error;
  }
}

export async function deleteCredentials(
  options: CredentialsStoreOptions
): Promise<boolean> {
  const { fs, filePath } = options;
  try {
    await fs.unlink(filePath);
    return true;
  } catch (error) {
    if (isNotFound(error)) {
      return false;
    }
    throw error;
  }
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "ENOENT"
  );
}
