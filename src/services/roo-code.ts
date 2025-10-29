import crypto from "node:crypto";
import path from "node:path";
import type { FileSystem } from "../utils/file-system.js";
import { isJsonObject, type JsonObject } from "../utils/json.js";
import {
  ensureDirectory,
  jsonMergeMutation,
  runServiceConfigure,
  runServiceRemove,
  type ServiceManifest,
  type ServiceMutation,
  type ServiceRunOptions
} from "./service-manifest.js";

const DEFAULT_RATE_LIMIT_SECONDS = 0;

export interface ConfigureRooCodeOptions {
  fs: FileSystem;
  configPath: string;
  settingsPath: string;
  configName: string;
  apiKey: string;
  model: string;
  baseUrl: string;
  autoImportPath: string;
  rateLimitSeconds?: number;
}

export interface RemoveRooCodeOptions {
  fs: FileSystem;
  configPath: string;
  settingsPath: string;
  configName: string;
  autoImportPath: string;
}

const ROO_CODE_MANIFEST: ServiceManifest<
  ConfigureRooCodeOptions,
  RemoveRooCodeOptions
> = {
  id: "roo-code",
  summary: "Configure Roo Code auto-import to use the Poe API.",
  configure: [
    ensureDirectory({
      path: ({ options }) => path.dirname(options.configPath),
      label: "Ensure Roo configuration directory"
    }),
    createConfigMutation(),
    ensureDirectory({
      path: ({ options }) => path.dirname(options.settingsPath),
      label: "Ensure VSCode settings directory"
    }),
    jsonMergeMutation({
      target: ({ options }) => options.settingsPath,
      label: "Configure Roo auto-import path",
      value: ({ options }) =>
        ({
          "roo-cline.autoImportSettingsPath": options.autoImportPath
        }) as JsonObject
    })
  ],
  remove: [createRemoveConfigMutation()]
};

export async function configureRooCode(
  options: ConfigureRooCodeOptions,
  runOptions?: ServiceRunOptions
): Promise<void> {
  await runServiceConfigure(
    ROO_CODE_MANIFEST,
    {
      fs: options.fs,
      options
    },
    runOptions
  );
}

export async function removeRooCode(
  options: RemoveRooCodeOptions,
  runOptions?: ServiceRunOptions
): Promise<boolean> {
  return runServiceRemove(
    ROO_CODE_MANIFEST,
    {
      fs: options.fs,
      options
    },
    runOptions
  );
}

function createConfigMutation(): ServiceMutation<ConfigureRooCodeOptions> {
  return {
    kind: "transformFile",
    label: "Merge Roo configuration",
    target: ({ options }) => options.configPath,
    async transform({ content, context }) {
      const existing = content ? parseJson(content) : {};
      const nextConfig: JsonObject = { ...existing };

      const providerProfiles = cloneObject(
        nextConfig.providerProfiles
      );
      const apiConfigs = cloneObject(providerProfiles.apiConfigs);
      const existingEntry = cloneObject(
        apiConfigs[context.options.configName]
      );
      const modeApiConfigs = cloneObject(providerProfiles.modeApiConfigs);

      const profileId =
        readString(existingEntry.id) ?? generateProfileId();
      const entry: JsonObject = {
        id: profileId,
        apiProvider: "openai",
        openAiApiKey: context.options.apiKey,
        openAiModelId: context.options.model,
        openAiBaseUrl: context.options.baseUrl,
        rateLimitSeconds:
          context.options.rateLimitSeconds ?? DEFAULT_RATE_LIMIT_SECONDS,
        diffEnabled: true
      };

      apiConfigs[context.options.configName] = entry;
      providerProfiles.apiConfigs = apiConfigs;
      providerProfiles.modeApiConfigs = modeApiConfigs;
      providerProfiles.currentApiConfigName = context.options.configName;

      nextConfig.providerProfiles = providerProfiles;

      const serialized = `${JSON.stringify(nextConfig, null, 2)}\n`;
      return {
        content: serialized,
        changed: serialized !== content
      };
    }
  };
}

function createRemoveConfigMutation(): ServiceMutation<RemoveRooCodeOptions> {
  return {
    kind: "transformFile",
    label: "Remove Roo configuration",
    target: ({ options }) => options.configPath,
    async transform({ content, context }) {
      if (content == null) {
        return { content: null, changed: false };
      }
      const existing = parseJson(content);
      if (!isJsonObject(existing.providerProfiles)) {
        return { content, changed: false };
      }

      const providerProfiles = cloneObject(existing.providerProfiles);
      const apiConfigs = cloneObject(providerProfiles.apiConfigs);
      if (!(context.options.configName in apiConfigs)) {
        return { content, changed: false };
      }

      delete apiConfigs[context.options.configName];
      providerProfiles.apiConfigs = apiConfigs;

      const remainingNames = Object.keys(apiConfigs);
      if (remainingNames.length === 0) {
        providerProfiles.currentApiConfigName = "";
      } else if (
        providerProfiles.currentApiConfigName === context.options.configName
      ) {
        providerProfiles.currentApiConfigName = remainingNames[0];
      }

      if (!isJsonObject(providerProfiles.modeApiConfigs)) {
        providerProfiles.modeApiConfigs = {};
      }

      const nextConfig: JsonObject = { ...existing, providerProfiles };
      const serialized = `${JSON.stringify(nextConfig, null, 2)}\n`;
      return {
        content: serialized,
        changed: serialized !== content
      };
    }
  };
}

function parseJson(content: string): JsonObject {
  const parsed = JSON.parse(content);
  if (!isJsonObject(parsed)) {
    throw new Error("Expected JSON object for Roo Code configuration.");
  }
  return parsed;
}

function cloneObject(value: unknown): JsonObject {
  if (!isJsonObject(value)) {
    return {};
  }
  return { ...value };
}

function readString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function generateProfileId(): string {
  return crypto.randomBytes(5).toString("hex");
}
