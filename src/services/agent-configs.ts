import path from "node:path";
import type { CliEnvironment } from "../cli/environment.js";
import type { FileSystem } from "../utils/file-system.js";
import { renderTemplate } from "../utils/templates.js";
import { quoteSinglePath } from "../providers/provider-helpers.js";
import { deepMergeJson, type JsonObject } from "../utils/json.js";
import {
  mergeTomlTables,
  parseTomlDocument,
  serializeTomlDocument,
  type TomlTable
} from "../utils/toml.js";
import {
  DEFAULT_CLAUDE_CODE_MODEL,
  DEFAULT_CODEX_MODEL,
  DEFAULT_FRONTIER_MODEL,
  DEFAULT_KIMI_MODEL,
  CLAUDE_CODE_VARIANTS,
  FRONTIER_MODELS,
  PROVIDER_NAME
} from "../cli/constants.js";

export type AgentService = "claude-code" | "codex" | "opencode" | "kimi";

interface ServiceBlueprint {
  files: Record<string, string>;
  indicator: string;
}

const SERVICE_HOMES: Record<AgentService, string> = {
  "claude-code": "claude-code",
  codex: "codex",
  opencode: "opencode",
  kimi: "kimi"
};

const SERVICE_BLUEPRINTS: Record<AgentService, ServiceBlueprint> = {
  "claude-code": {
    files: {
      settings: path.join(".claude", "settings.json"),
      script: path.join(".claude", "anthropic_key.sh")
    },
    indicator: path.join(".claude", "settings.json")
  },
  codex: {
    files: {
      config: path.join(".codex", "config.toml")
    },
    indicator: path.join(".codex", "config.toml")
  },
  opencode: {
    files: {
      config: path.join(".config", "opencode", "config.json"),
      auth: path.join(".local", "share", "opencode", "auth.json")
    },
    indicator: path.join(".config", "opencode", "config.json")
  },
  kimi: {
    files: {
      config: path.join(".kimi", "config.json")
    },
    indicator: path.join(".kimi", "config.json")
  }
};

export interface ServicePaths {
  home: string;
  files: Record<string, string>;
  indicator: string;
}

export function resolveServicePaths(
  service: AgentService,
  env: CliEnvironment
): ServicePaths {
  return resolveServicePathsFromHome(service, env.homeDir);
}

export function resolveServicePathsFromHome(
  service: AgentService,
  homeDir: string
): ServicePaths {
  const base = path.join(homeDir, ".poe-code", SERVICE_HOMES[service]);
  const blueprint = SERVICE_BLUEPRINTS[service];
  const files = Object.fromEntries(
    Object.entries(blueprint.files).map(([key, relative]) => [
      key,
      path.join(base, relative)
    ])
  );
  return {
    home: base,
    files,
    indicator: path.join(base, blueprint.indicator)
  };
}

export interface AgentConfigOptions {
  fs: FileSystem;
  env: CliEnvironment;
  apiKey: string;
  defaults?: Partial<Record<AgentService, string>>;
}

const SERVICES: AgentService[] = [
  "claude-code",
  "codex",
  "opencode",
  "kimi"
];

export async function generateAgentConfigs(
  options: AgentConfigOptions
): Promise<void> {
  await Promise.all(
    SERVICES.map(async (service) => {
      switch (service) {
        case "claude-code":
          await generateClaudeConfig(options);
          break;
        case "codex":
          await generateCodexConfig(options);
          break;
        case "opencode":
          await generateOpenCodeConfig(options);
          break;
        case "kimi":
          await generateKimiConfig(options);
          break;
      }
    })
  );
}

export async function hasAgentConfig(options: {
  fs: FileSystem;
  env: CliEnvironment;
  service: AgentService;
}): Promise<boolean> {
  const indicator = resolveServicePaths(options.service, options.env).indicator;
  try {
    await options.fs.stat(indicator);
    return true;
  } catch (error) {
    if (isNotFound(error)) {
      return false;
    }
    throw error;
  }
}

function isNotFound(error: unknown): error is { code?: string } {
  return Boolean(error && typeof error === "object" && (error as { code?: string }).code === "ENOENT");
}

async function ensureParent(fs: FileSystem, target: string): Promise<void> {
  await fs.mkdir(path.dirname(target), { recursive: true });
}

async function readJson(fs: FileSystem, target: string): Promise<JsonObject> {
  try {
    const raw = await fs.readFile(target, "utf8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function stringifyJson(value: JsonObject): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function generateClaudeConfig(options: AgentConfigOptions): Promise<void> {
  const paths = resolveServicePaths("claude-code", options.env);
  const settingsPath = paths.files.settings;
  const scriptPath = paths.files.script;
  await ensureParent(options.fs, settingsPath);
  await ensureParent(options.fs, scriptPath);
  const script = await renderTemplate("claude-code/anthropic_key.sh.hbs", {
    credentialsPathLiteral: quoteSinglePath(options.env.credentialsPath)
  });
  await options.fs.writeFile(scriptPath, script, { encoding: "utf8" });
  if (typeof options.fs.chmod === "function") {
    await options.fs.chmod(scriptPath, 0o700);
  }
  const model = options.defaults?.["claude-code"] ?? DEFAULT_CLAUDE_CODE_MODEL;
  const desired = deepMergeJson(await readJson(options.fs, settingsPath), {
    apiKeyHelper: scriptPath,
    env: {
      ANTHROPIC_BASE_URL: "https://api.poe.com",
      ANTHROPIC_DEFAULT_HAIKU_MODEL: CLAUDE_CODE_VARIANTS.haiku,
      ANTHROPIC_DEFAULT_SONNET_MODEL: CLAUDE_CODE_VARIANTS.sonnet,
      ANTHROPIC_DEFAULT_OPUS_MODEL: CLAUDE_CODE_VARIANTS.opus
    },
    model
  });
  await options.fs.writeFile(settingsPath, stringifyJson(desired), {
    encoding: "utf8"
  });
}

async function generateCodexConfig(options: AgentConfigOptions): Promise<void> {
  const paths = resolveServicePaths("codex", options.env);
  const configPath = paths.files.config;
  await ensureParent(options.fs, configPath);
  const template = await renderTemplate("codex/config.toml.hbs", {
    model: options.defaults?.codex ?? DEFAULT_CODEX_MODEL,
    reasoningEffort: "medium",
    apiKey: options.apiKey
  });
  const existing = await readToml(options.fs, configPath);
  const merged = mergeTomlTables(existing, parseTomlDocument(template));
  await options.fs.writeFile(configPath, serializeTomlDocument(merged), {
    encoding: "utf8"
  });
}

async function readToml(fs: FileSystem, target: string): Promise<TomlTable> {
  try {
    const raw = await fs.readFile(target, "utf8");
    return parseTomlDocument(raw);
  } catch {
    return {};
  }
}

async function generateOpenCodeConfig(options: AgentConfigOptions): Promise<void> {
  const paths = resolveServicePaths("opencode", options.env);
  const configPath = paths.files.config;
  const authPath = paths.files.auth;
  await ensureParent(options.fs, configPath);
  await ensureParent(options.fs, authPath);
  const model = options.defaults?.opencode ?? DEFAULT_FRONTIER_MODEL;
  const config = deepMergeJson(await readJson(options.fs, configPath), {
    $schema: "https://opencode.ai/config.json",
    model: `${PROVIDER_NAME}/${model}`,
    provider: {
      [PROVIDER_NAME]: {
        npm: "@ai-sdk/openai-compatible",
        name: "poe.com",
        options: { baseURL: "https://api.poe.com/v1" },
        models: FRONTIER_MODELS.reduce<JsonObject>((acc, entry) => {
          acc[entry] = { name: entry };
          return acc;
        }, {})
      }
    }
  });
  await options.fs.writeFile(configPath, stringifyJson(config), {
    encoding: "utf8"
  });
  const auth = deepMergeJson(await readJson(options.fs, authPath), {
    [PROVIDER_NAME]: {
      type: "api",
      key: options.apiKey
    }
  });
  await options.fs.writeFile(authPath, stringifyJson(auth), {
    encoding: "utf8"
  });
}

async function generateKimiConfig(options: AgentConfigOptions): Promise<void> {
  const paths = resolveServicePaths("kimi", options.env);
  const configPath = paths.files.config;
  await ensureParent(options.fs, configPath);
  const model = options.defaults?.kimi ?? DEFAULT_KIMI_MODEL;
  const prefixed = `${PROVIDER_NAME}/${model}`;
  const config = deepMergeJson(await readJson(options.fs, configPath), {
    default_model: prefixed,
    models: {
      [prefixed]: {
        provider: PROVIDER_NAME,
        model,
        max_context_size: 256000
      }
    },
    providers: {
      [PROVIDER_NAME]: {
        type: "openai_legacy",
        base_url: "https://api.poe.com/v1",
        api_key: options.apiKey
      }
    }
  });
  await options.fs.writeFile(configPath, stringifyJson(config), {
    encoding: "utf8"
  });
}
