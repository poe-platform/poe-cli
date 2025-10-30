import path from "node:path";
import type { FileSystem } from "../utils/file-system.js";
import type {
  CommandRunner,
  CommandRunnerResult,
  PrerequisiteDefinition,
  PrerequisiteManager
} from "../utils/prerequisites.js";
import {
  createBinaryExistsCheck,
  formatCommandRunnerResult
} from "../utils/prerequisites.js";
import {
  createBackupMutation,
  ensureDirectory,
  runServiceConfigure,
  runServiceRemove,
  type ServiceManifest,
  type ServiceRunOptions
} from "./service-manifest.js";
import {
  parseTomlDocument,
  serializeTomlDocument,
  type TomlTable
} from "../utils/toml.js";
import {
  runServiceInstall,
  type InstallContext,
  type ServiceInstallDefinition
} from "./service-install.js";

export interface ConfigureCodexOptions {
  fs: FileSystem;
  configPath: string;
  apiKey: string;
  model: string;
  reasoningEffort: string;
  timestamp?: () => string;
}

export interface RemoveCodexOptions {
  fs: FileSystem;
  configPath: string;
}

export interface SpawnCodexOptions {
  prompt: string;
  args?: string[];
  runCommand: CommandRunner;
}

const CODEX_PROVIDER_ID = "poe";
const CODEX_BASE_URL = "https://api.poe.com/v1";
const CODEX_TOP_LEVEL_FIELDS = [
  "model",
  "model_reasoning_effort"
] as const;
const CODEX_PROVIDER_BASE_FIELDS = {
  name: "poe",
  base_url: CODEX_BASE_URL,
  wire_api: "chat"
} as const;
const CODEX_PROVIDER_ENV_KEY = "POE_API_KEY" as const;
const CODEX_PROVIDER_LEGACY_ENV_KEY = "OPENAI_API_KEY" as const;
const CODEX_PROVIDER_BEARER_TOKEN = "POE_API_KEY" as const;

const CODEX_MANIFEST: ServiceManifest<
  ConfigureCodexOptions,
  RemoveCodexOptions
> = {
  id: "codex",
  summary: "Configure Codex to use Poe as the model provider.",
  prerequisites: {
    after: ["codex-cli-health"]
  },
  configure: [
    ensureDirectory({
      path: ({ options }) => path.dirname(options.configPath),
      label: "Ensure Codex config directory"
    }),
    createBackupMutation({
      target: ({ options }) => options.configPath,
      timestamp: ({ options }) => options.timestamp,
      label: "Create Codex config backup"
    }),
    {
      kind: "transformFile",
      target: ({ options }) => options.configPath,
      label: "Merge Codex configuration",
      transform({ content, context }) {
        let document: TomlTable;
        if (content == null) {
          document = {};
        } else {
          try {
            document = parseTomlDocument(content);
          } catch {
            document = {};
          }
        }
        applyCodexConfiguration(document, {
          model: context.options.model,
          reasoningEffort: context.options.reasoningEffort
        });
        const nextContent = serializeTomlDocument(document);
        return {
          content: nextContent,
          changed: nextContent !== (content ?? "")
        };
      }
    }
  ],
  remove: [
    {
      kind: "transformFile",
      target: ({ options }) => options.configPath,
      label: "Remove Codex managed configuration",
      transform({ content }) {
        if (content == null) {
          return { content: null, changed: false };
        }

        let document: TomlTable;
        try {
          document = parseTomlDocument(content);
        } catch {
          return { content, changed: false };
        }

        const result = stripCodexConfiguration(document);
        if (!result.changed) {
          return { content, changed: false };
        }

        if (result.empty) {
          return { content: null, changed: true };
        }

        const nextContent = serializeTomlDocument(document);
        return {
          content: nextContent,
          changed: nextContent !== content
        };
      }
    }
  ]
};

const CODEX_INSTALL_DEFINITION: ServiceInstallDefinition = {
  id: "codex",
  summary: "Codex CLI",
  check: createCodexBinaryCheck(),
  steps: [
    {
      id: "install-codex-cli-npm",
      description: "Install Codex CLI via npm",
      command: "npm",
      args: ["install", "-g", "@openai/codex"]
    }
  ],
  postChecks: [createCodexVersionCheck()],
  successMessage: "Installed Codex CLI via npm."
};

function applyCodexConfiguration(
  document: TomlTable,
  config: {
    model: string;
    reasoningEffort: string;
  }
): void {
  document["model_provider"] = CODEX_PROVIDER_ID;
  document["model"] = config.model;
  document["model_reasoning_effort"] = config.reasoningEffort;

  const providersValue = document["model_providers"];
  const providers: TomlTable = isPlainObject(providersValue)
    ? providersValue
    : {};
  if (!isPlainObject(providersValue)) {
    document["model_providers"] = providers;
  }

  const poeValue = providers[CODEX_PROVIDER_ID];
  const poeProvider: TomlTable = isPlainObject(poeValue) ? poeValue : {};
  if (!isPlainObject(poeValue)) {
    providers[CODEX_PROVIDER_ID] = poeProvider;
  }

  Object.assign(poeProvider, CODEX_PROVIDER_BASE_FIELDS);
  poeProvider["env_key"] = CODEX_PROVIDER_ENV_KEY;
  poeProvider["experimental_bearer_token"] = CODEX_PROVIDER_BEARER_TOKEN;
}

function stripCodexConfiguration(
  document: TomlTable
): { changed: boolean; empty: boolean } {
  if (!isPlainObject(document)) {
    return { changed: false, empty: false };
  }

  if (document["model_provider"] !== CODEX_PROVIDER_ID) {
    return { changed: false, empty: false };
  }

  const providers = document["model_providers"];
  if (!isPlainObject(providers)) {
    return { changed: false, empty: false };
  }

  const poeConfig = providers[CODEX_PROVIDER_ID];
  if (!isPlainObject(poeConfig) || !matchesExpectedProviderConfig(poeConfig)) {
    return { changed: false, empty: false };
  }

  for (const field of CODEX_TOP_LEVEL_FIELDS) {
    if (typeof document[field] !== "string") {
      return { changed: false, empty: false };
    }
  }

  delete document["model_provider"];

  for (const field of CODEX_TOP_LEVEL_FIELDS) {
    delete document[field];
  }

  delete providers[CODEX_PROVIDER_ID];

  if (isTableEmpty(providers)) {
    delete document["model_providers"];
  }

  return {
    changed: true,
    empty: isTableEmpty(document)
  };
}

function matchesExpectedProviderConfig(table: TomlTable): boolean {
  for (const [key, expectedValue] of Object.entries(
    CODEX_PROVIDER_BASE_FIELDS
  )) {
    if (table[key] !== expectedValue) {
      return false;
    }
  }

  const envKey = table["env_key"];
  if (
    envKey !== CODEX_PROVIDER_ENV_KEY &&
    envKey !== CODEX_PROVIDER_LEGACY_ENV_KEY
  ) {
    return false;
  }

  const bearer = table["experimental_bearer_token"];
  if (
    bearer != null &&
    bearer !== CODEX_PROVIDER_BEARER_TOKEN
  ) {
    return false;
  }

  return true;
}

function isPlainObject(value: unknown): value is TomlTable {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function isTableEmpty(value: unknown): value is TomlTable {
  return isPlainObject(value) && Object.keys(value).length === 0;
}

export async function configureCodex(
  options: ConfigureCodexOptions,
  runOptions?: ServiceRunOptions
): Promise<void> {
  await runServiceConfigure(
    CODEX_MANIFEST,
    {
      fs: options.fs,
      options
    },
    runOptions
  );
}

export async function spawnCodex(
  options: SpawnCodexOptions
): Promise<CommandRunnerResult> {
  const args = ["exec", options.prompt, ...(options.args ?? [])];
  return options.runCommand("codex", args);
}

export async function removeCodex(
  options: RemoveCodexOptions,
  runOptions?: ServiceRunOptions
): Promise<boolean> {
  return runServiceRemove(
    CODEX_MANIFEST,
    {
      fs: options.fs,
      options
    },
    runOptions
  );
}

export async function installCodex(
  context: InstallContext
): Promise<boolean> {
  return runServiceInstall(CODEX_INSTALL_DEFINITION, context);
}

export function registerCodexPrerequisites(
  prerequisites: PrerequisiteManager
): void {
  prerequisites.registerAfter(createCodexCliHealthCheck());
}

function createCodexBinaryCheck(): PrerequisiteDefinition {
  return createBinaryExistsCheck(
    "codex",
    "codex-cli-binary",
    "Codex CLI binary must exist"
  );
}

function createCodexVersionCheck(): PrerequisiteDefinition {
  return {
    id: "codex-cli-version",
    description: "Codex CLI responds to --version",
    async run({ runCommand }) {
      const result = await runCommand("codex", ["--version"]);
      if (result.exitCode !== 0) {
        throw new Error(
          `Codex CLI --version failed with exit code ${result.exitCode}.`
        );
      }
    }
  };
}

function createCodexCliHealthCheck(): PrerequisiteDefinition {
  return {
    id: "codex-cli-health",
    description: "Codex CLI health check must succeed",
    async run({ runCommand }) {
      const result = await spawnCodex({
        prompt: "Output exactly: CODEX_OK",
        runCommand
      });
      if (result.exitCode !== 0) {
        const detail = formatCommandRunnerResult(result);
        throw new Error(
          [
            `Codex CLI health check failed with exit code ${result.exitCode}.`,
            detail
          ].join("\n")
        );
      }
      const output = result.stdout.trim();
      if (output !== "CODEX_OK") {
        const detail = formatCommandRunnerResult(result);
        throw new Error(
          [
            `Codex CLI health check failed: expected "CODEX_OK" but received "${output}".`,
            detail
          ].join("\n")
        );
      }
    }
  };
}
