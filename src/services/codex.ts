import path from "node:path";
import type { FileSystem } from "../utils/file-system.js";
import { createBackup } from "../utils/backup.js";
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

  const content = await readFileIfExists(fs, configPath);
  if (content == null) {
    return false;
  }

  if (isGeneratedConfig(content)) {
    await fs.unlink(configPath);
    return true;
  }

  const cleaned = removeGeneratedBlock(content);
  if (cleaned === content) {
    return false;
  }

  if (cleaned.trim().length === 0) {
    await fs.unlink(configPath);
  } else {
    await fs.writeFile(configPath, cleaned, { encoding: "utf8" });
  }
  return true;
}

async function readFileIfExists(
  fs: FileSystem,
  target: string
): Promise<string | null> {
  try {
    return await fs.readFile(target, "utf8");
  } catch (error) {
    if (isNotFound(error)) {
      return null;
    }
    throw error;
  }
}

const CODEX_BLOCK_LINES = [
  'model_provider = "poe"',
  'model = "[^"\\r\\n]+"',
  'model_reasoning_effort = "[^"\\r\\n]+"',
  "",
  "\\[model_providers\\.poe\\]",
  'name = "poe"',
  'base_url = "https://api\\.poe\\.com/v1"',
  'wire_api = "chat"',
  'env_key = "POE_API_KEY"'
] as const;

const CODEX_BLOCK_PATTERN = new RegExp(
  CODEX_BLOCK_LINES.map((line, index) => {
    if (line === "") {
      return "(?:\\r?\\n){1}";
    }
    const suffix = index === CODEX_BLOCK_LINES.length - 1 ? "" : "(?:\\r?\\n)";
    return `${line}${suffix}`;
  }).join(""),
  "g"
);

function removeGeneratedBlock(content: string): string {
  return content.replace(CODEX_BLOCK_PATTERN, (match) => {
    if (/^\s*$/.test(match)) {
      return "";
    }
    return "\n";
  });
}

function isGeneratedConfig(content: string): boolean {
  const trimmed = content.trim();
  const anchoredPattern = new RegExp(
    `^${CODEX_BLOCK_PATTERN.source}$`
  );
  return anchoredPattern.test(trimmed);
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "ENOENT"
  );
}
