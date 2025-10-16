import type { FileSystem } from "../utils/file-system.js";
import { createBackup, restoreLatestBackup } from "../utils/backup.js";
import { renderTemplate } from "../utils/templates.js";

export interface ConfigureClaudeCodeOptions {
  fs: FileSystem;
  bashrcPath: string;
  apiKey: string;
  timestamp?: () => string;
}

export interface RemoveClaudeCodeOptions {
  fs: FileSystem;
  bashrcPath: string;
}

const CLAUDE_TEMPLATE = "claude-code/bashrc.hbs";

export async function configureClaudeCode(
  options: ConfigureClaudeCodeOptions
): Promise<void> {
  const { fs, bashrcPath, apiKey, timestamp } = options;

  const existing = (await readFileIfExists(fs, bashrcPath)) ?? "";
  await createBackup(fs, bashrcPath, timestamp);

  const snippet = await renderTemplate(CLAUDE_TEMPLATE, { apiKey });
  const trimmed = existing.trimEnd();
  const nextContent = trimmed.length > 0 ? `${trimmed}\n\n${snippet}` : snippet;

  await fs.writeFile(bashrcPath, nextContent, { encoding: "utf8" });
}

export async function removeClaudeCode(
  options: RemoveClaudeCodeOptions
): Promise<boolean> {
  const { fs, bashrcPath } = options;

  const restored = await restoreLatestBackup(fs, bashrcPath);
  if (restored) {
    return true;
  }

  const current = await readFileIfExists(fs, bashrcPath);
  if (current == null) {
    return false;
  }

  const cleaned = removeSnippet(current);
  if (cleaned === current) {
    return false;
  }

  await fs.writeFile(bashrcPath, cleaned, { encoding: "utf8" });
  return true;
}

async function readFileIfExists(
  fs: FileSystem,
  filePath: string
): Promise<string | null> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (isNotFound(error)) {
      return null;
    }
    throw error;
  }
}

function removeSnippet(content: string): string {
  const block =
    'export POE_API_KEY="[^"\\n]+"\n' +
    "export ANTHROPIC_API_KEY=\\$POE_API_KEY\n" +
    'export ANTHROPIC_BASE_URL="https://api\\.poe\\.com"';

  const pattern = new RegExp(`(?:\\r?\\n){0,2}${block}\\s*$`);
  return content.replace(pattern, "");
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "ENOENT"
  );
}
