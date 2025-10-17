import path from "node:path";
import type { FileSystem } from "../utils/file-system.js";
import {
  createBackupMutation,
  ensureDirectory,
  runServiceConfigure,
  runServiceRemove,
  type ServiceManifest,
  type ServiceRunOptions,
  writeTemplateMutation
} from "./service-manifest.js";
import {
  parseTomlDocument,
  serializeTomlDocument,
  type TomlTable
} from "../utils/toml.js";

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
const CODEX_PROVIDER_ID = "poe";
const CODEX_BASE_URL = "https://api.poe.com/v1";
const CODEX_TOP_LEVEL_FIELDS = [
  "model",
  "model_reasoning_effort"
] as const;
const CODEX_PROVIDER_EXPECTED_FIELDS = {
  name: "poe",
  base_url: CODEX_BASE_URL,
  wire_api: "chat",
  env_key: "POE_API_KEY"
} as const;

const CODEX_MANIFEST: ServiceManifest<
  ConfigureCodexOptions,
  RemoveCodexOptions
> = {
  id: "codex",
  summary: "Configure Codex to use Poe as the model provider.",
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
    writeTemplateMutation({
      target: ({ options }) => options.configPath,
      templateId: CODEX_TEMPLATE,
      label: "Write Codex config template",
      context: ({ options }) => ({
        model: options.model,
        reasoningEffort: options.reasoningEffort
      })
    })
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
  return Object.entries(CODEX_PROVIDER_EXPECTED_FIELDS).every(
    ([key, expectedValue]) => table[key] === expectedValue
  );
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
