import path from "node:path";
import type { FileSystem } from "../utils/file-system.js";
import { createBackup, restoreLatestBackup } from "../utils/backup.js";
import { renderTemplate } from "../utils/templates.js";

export interface ConfigureCodexOptions {
  fs: FileSystem;
  configPath: string;
  model: string;
  reasoningEffort: string;
  timestamp?: () => string;
}

export interface RemoveCodexOptions {
  fs: FileSystem;
  configPath: string;
}

const CODEX_TEMPLATE = "codex/config.toml.hbs";

export async function configureCodex(
  options: ConfigureCodexOptions
): Promise<void> {
  const { fs, configPath, model, reasoningEffort, timestamp } = options;

  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await createBackup(fs, configPath, timestamp);

  const rendered = await renderTemplate(CODEX_TEMPLATE, {
    model,
    reasoningEffort
  });

  await fs.writeFile(configPath, rendered, { encoding: "utf8" });
}

export async function removeCodex(
  options: RemoveCodexOptions
): Promise<boolean> {
  const { fs, configPath } = options;

  const restored = await restoreLatestBackup(fs, configPath);
  if (restored) {
    return true;
  }

  if (!(await exists(fs, configPath))) {
    return false;
  }

  await fs.unlink(configPath);
  return true;
}

async function exists(fs: FileSystem, target: string): Promise<boolean> {
  try {
    await fs.stat(target);
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
