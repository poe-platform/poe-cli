import path from "node:path";
import type { FileSystem } from "../utils/file-system.js";
import type { JsonObject } from "../utils/json.js";
import {
  ensureDirectory,
  jsonMergeMutation,
  jsonPruneMutation,
  removeFileMutation,
  runServiceConfigure,
  runServiceRemove,
  type ServiceManifest,
  type ServiceRunOptions
} from "./service-manifest.js";

const OPEN_CODE_CONFIG_TEMPLATE: JsonObject = {
  $schema: "https://opencode.ai/config.json",
  provider: {
    poe: {
      npm: "@ai-sdk/openai-compatible",
      name: "poe.com",
      options: {
        baseURL: "https://api.poe.com/v1"
      },
      models: {
        "Claude-Sonnet-4.5": {
          name: "Claude Sonnet 4.5"
        },
        "GPT-5-Codex": {
          name: "GPT-5-Codex"
        }
      }
    }
  }
};

const OPEN_CODE_CONFIG_SHAPE: JsonObject = {
  provider: {
    poe: true
  }
};

const OPEN_CODE_AUTH_SHAPE: JsonObject = {
  poe: true
};

export interface ConfigureOpenCodeOptions {
  fs: FileSystem;
  configPath: string;
  authPath: string;
  apiKey: string;
}

export interface RemoveOpenCodeOptions {
  fs: FileSystem;
  configPath: string;
  authPath: string;
}

const OPEN_CODE_MANIFEST: ServiceManifest<
  ConfigureOpenCodeOptions,
  RemoveOpenCodeOptions
> = {
  id: "opencode",
  summary: "Configure OpenCode CLI to use the Poe API.",
  configure: [
    ensureDirectory({
      path: ({ options }) => path.dirname(options.configPath),
      label: "Ensure OpenCode config directory"
    }),
    ensureDirectory({
      path: ({ options }) => path.dirname(options.authPath),
      label: "Ensure OpenCode auth directory"
    }),
    jsonMergeMutation({
      target: ({ options }) => options.configPath,
      label: "Merge OpenCode config",
      value: () => OPEN_CODE_CONFIG_TEMPLATE
    }),
    jsonMergeMutation({
      target: ({ options }) => options.authPath,
      label: "Merge OpenCode auth",
      value: ({ options }) =>
        ({
          poe: {
            type: "api",
            key: options.apiKey
          }
        }) as JsonObject
    })
  ],
  remove: [
    jsonPruneMutation({
      target: ({ options }) => options.configPath,
      label: "Prune OpenCode config",
      shape: () => OPEN_CODE_CONFIG_SHAPE
    }),
    jsonPruneMutation({
      target: ({ options }) => options.authPath,
      label: "Prune OpenCode auth",
      shape: () => OPEN_CODE_AUTH_SHAPE
    }),
    removeFileMutation({
      target: ({ options }) => options.authPath,
      label: "Delete OpenCode auth when empty",
      whenEmpty: true
    })
  ]
};

export async function configureOpenCode(
  options: ConfigureOpenCodeOptions,
  runOptions?: ServiceRunOptions
): Promise<void> {
  await runServiceConfigure(
    OPEN_CODE_MANIFEST,
    {
      fs: options.fs,
      options
    },
    runOptions
  );
}

export async function removeOpenCode(
  options: RemoveOpenCodeOptions,
  runOptions?: ServiceRunOptions
): Promise<boolean> {
  return runServiceRemove(
    OPEN_CODE_MANIFEST,
    {
      fs: options.fs,
      options
    },
    runOptions
  );
}
