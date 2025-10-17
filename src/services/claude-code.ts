import path from "node:path";
import type { FileSystem } from "../utils/file-system.js";
import type { PrerequisiteManager } from "../utils/prerequisites.js";

export interface ConfigureClaudeCodeOptions {
  fs: FileSystem;
  bashrcPath: string;
  apiKey: string;
  settingsPath: string;
}

export interface RemoveClaudeCodeOptions {
  fs: FileSystem;
  bashrcPath: string;
}

export async function configureClaudeCode(
  options: ConfigureClaudeCodeOptions
): Promise<void> {
  const { fs, bashrcPath, apiKey, settingsPath } = options;

  await updateSettingsFile(fs, settingsPath, apiKey);

  const current = await readFileIfExists(fs, bashrcPath);
  if (current == null) {
    return;
  }

  const cleaned = removeSnippet(current);
  if (cleaned !== current) {
    await fs.writeFile(bashrcPath, cleaned, { encoding: "utf8" });
  }
}

export async function removeClaudeCode(
  options: RemoveClaudeCodeOptions
): Promise<boolean> {
  const { fs, bashrcPath } = options;

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
    'export POE_API_KEY="[^"\\n]+"' +
    "(?:\\r?\\n)export ANTHROPIC_API_KEY=\\$POE_API_KEY" +
    '(?:\\r?\\n)export ANTHROPIC_BASE_URL="https://api\\.poe\\.com"';

  const trailingPattern = new RegExp(`(?:\\r?\\n){0,2}${block}\\s*$`);
  if (trailingPattern.test(content)) {
    return content.replace(trailingPattern, "");
  }

  const inlinePattern = new RegExp(
    `(?:^|\\r?\\n)${block}(?:\\r?\\n|$)`,
    "g"
  );

  return content.replace(inlinePattern, (match) => {
    if (match.startsWith("\r\n") && match.endsWith("\r\n")) {
      return "\r\n";
    }
    if (match.startsWith("\n") && match.endsWith("\n")) {
      return "\n";
    }
    return "";
  });
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "ENOENT"
  );
}

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonObject | JsonArray;
interface JsonObject {
  [key: string]: JsonValue;
}
type JsonArray = JsonValue[];

async function updateSettingsFile(
  fs: FileSystem,
  settingsPath: string,
  apiKey: string
): Promise<void> {
  const desired: JsonObject = {
    env: {
      POE_API_KEY: apiKey,
      ANTHROPIC_BASE_URL: "https://api.poe.com",
      ANTHROPIC_API_KEY: apiKey
    }
  };

  await fs.mkdir(path.dirname(settingsPath), { recursive: true });
  const existing = await readJsonIfExists(fs, settingsPath);
  const merged = deepMergeJson(existing ?? {}, desired);
  const payload = JSON.stringify(merged, null, 2);
  await fs.writeFile(settingsPath, `${payload}\n`, { encoding: "utf8" });
}

async function readJsonIfExists(
  fs: FileSystem,
  settingsPath: string
): Promise<JsonObject | null> {
  try {
    const raw = await fs.readFile(settingsPath, "utf8");
    const parsed = JSON.parse(raw);
    return isJsonObject(parsed) ? parsed : {};
  } catch (error) {
    if (isNotFound(error)) {
      return null;
    }
    throw error;
  }
}

function deepMergeJson(
  target: JsonObject,
  source: JsonObject
): JsonObject {
  const result: JsonObject = { ...target };
  for (const [key, value] of Object.entries(source)) {
    const existing = result[key];
    if (isJsonObject(existing) && isJsonObject(value)) {
      result[key] = deepMergeJson(existing, value);
      continue;
    }
    result[key] = value;
  }
  return result;
}

function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

export function registerClaudeCodePrerequisites(
  prerequisites: PrerequisiteManager
): void {
  prerequisites.registerBefore({
    id: "claude-cli-binary",
    description: "Claude CLI binary must exist",
    async run({ runCommand }) {
      const result = await runCommand("which", ["claude"]);
      if (result.exitCode !== 0) {
        throw new Error("Claude CLI binary not found on PATH.");
      }
    }
  });

  prerequisites.registerAfter({
    id: "claude-cli-health",
    description: "Claude CLI health check must succeed",
    async run({ runCommand }) {
      const result = await runCommand("claude", [
        "-p",
        "Output exactly: CLAUDE_CODE_OK",
        "--output-format",
        "text"
      ]);
      if (result.exitCode !== 0) {
        throw new Error(
          `Claude CLI health check failed with exit code ${result.exitCode}.`
        );
      }
      const output = result.stdout.trim();
      if (output !== "CLAUDE_CODE_OK") {
        throw new Error(
          `Claude CLI health check failed: expected "CLAUDE_CODE_OK" but received "${output}".`
        );
      }
    }
  });
}
