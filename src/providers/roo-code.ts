import path from "node:path";
import crypto from "node:crypto";
import type { ProviderService } from "../cli/service-registry.js";
import type { FileSystem } from "../utils/file-system.js";
import { isJsonObject, type JsonObject } from "../utils/json.js";
import {
  createServiceManifest,
  ensureDirectory,
  jsonMergeMutation
} from "../services/service-manifest.js";

const DEFAULT_RATE_LIMIT_SECONDS = 0;

export interface RooCodePaths extends Record<string, string> {
  configPath: string;
  settingsPath: string;
  autoImportPath: string;
}

export type RooCodeConfigureOptions = {
  configPath: string;
  settingsPath: string;
  configName: string;
  apiKey: string;
  model: string;
  baseUrl: string;
  autoImportPath: string;
  rateLimitSeconds?: number;
};

export type RooCodeRemoveOptions = {
  configPath: string;
  settingsPath: string;
  configName: string;
  autoImportPath: string;
};

async function buildRooConfigContent(input: {
  fs: FileSystem;
  options: RooCodeConfigureOptions;
  current: string | null;
}): Promise<{ content: string; changed: boolean }> {
  const document = await readJsonDocument(input);
  const nextConfig = mergeRooProfile(document, input.options);
  const serialized = serializeJson(nextConfig);
  const previous = input.current ?? "";
  return {
    content: serialized,
    changed: serialized !== previous
  };
}

async function pruneRooConfigContent(input: {
  fs: FileSystem;
  options: RooCodeRemoveOptions;
  current: string | null;
}): Promise<{ content: string | null; changed: boolean }> {
  const document = await readJsonDocument(input);
  const result = removeRooProfile(document, input.options);
  if (!result.changed) {
    return { content: input.current, changed: false };
  }
  const serialized = serializeJson(result.result);
  const previous = input.current ?? "";
  return {
    content: serialized,
    changed: serialized !== previous
  };
}

async function readJsonDocument(input: {
  fs: FileSystem;
  options: { configPath: string };
  current: string | null;
}): Promise<JsonObject> {
  if (input.current == null) {
    return {};
  }
  try {
    const parsed = JSON.parse(input.current);
    if (!isJsonObject(parsed)) {
      throw new Error("Expected JSON object.");
    }
    return parsed;
  } catch {
    await backupInvalidJsonDocument(
      input.fs,
      input.options.configPath,
      input.current
    );
    return {};
  }
}

async function backupInvalidJsonDocument(
  fs: FileSystem,
  targetPath: string,
  content: string
): Promise<void> {
  const backupPath = createInvalidDocumentBackupPath(targetPath);
  await fs.writeFile(backupPath, content, { encoding: "utf8" });
}

function createInvalidDocumentBackupPath(targetPath: string): string {
  return `${targetPath}.invalid-${createTimestamp()}.json`;
}

function createTimestamp(): string {
  return new Date()
    .toISOString()
    .replaceAll(":", "-")
    .replaceAll(".", "-");
}

function mergeRooProfile(
  document: JsonObject,
  options: RooCodeConfigureOptions
): JsonObject {
  const nextConfig: JsonObject = { ...document };
  const providerProfiles = cloneObject(nextConfig.providerProfiles);
  const apiConfigs = cloneObject(providerProfiles.apiConfigs);
  const existingEntry = cloneObject(apiConfigs[options.configName]);
  const modeApiConfigs = cloneObject(providerProfiles.modeApiConfigs);

  const profileId = readString(existingEntry.id) ?? generateProfileId();
  const entry: JsonObject = {
    id: profileId,
    apiProvider: "openai",
    openAiApiKey: options.apiKey,
    openAiModelId: options.model,
    openAiBaseUrl: options.baseUrl,
    rateLimitSeconds:
      options.rateLimitSeconds ?? DEFAULT_RATE_LIMIT_SECONDS,
    diffEnabled: true
  };

  apiConfigs[options.configName] = entry;
  providerProfiles.apiConfigs = apiConfigs;
  providerProfiles.modeApiConfigs = modeApiConfigs;
  providerProfiles.currentApiConfigName = options.configName;

  nextConfig.providerProfiles = providerProfiles;
  return nextConfig;
}

function removeRooProfile(
  document: JsonObject,
  options: RooCodeRemoveOptions
): { changed: boolean; result: JsonObject } {
  if (!isJsonObject(document.providerProfiles)) {
    return { changed: false, result: document };
  }

  const providerProfiles = cloneObject(document.providerProfiles);
  const apiConfigs = cloneObject(providerProfiles.apiConfigs);
  if (!(options.configName in apiConfigs)) {
    return { changed: false, result: document };
  }

  delete apiConfigs[options.configName];
  providerProfiles.apiConfigs = apiConfigs;

  const remainingNames = Object.keys(apiConfigs);
  if (remainingNames.length === 0) {
    providerProfiles.currentApiConfigName = "";
  } else if (
    providerProfiles.currentApiConfigName === options.configName
  ) {
    providerProfiles.currentApiConfigName = remainingNames[0];
  }

  if (!isJsonObject(providerProfiles.modeApiConfigs)) {
    providerProfiles.modeApiConfigs = {};
  }

  const nextConfig: JsonObject = { ...document, providerProfiles };
  return { changed: true, result: nextConfig };
}

function serializeJson(value: JsonObject): string {
  return `${JSON.stringify(value, null, 2)}\n`;
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

function resolveVsCodeSettingsPath(
  platform: NodeJS.Platform,
  homeDir: string,
  variables: Record<string, string | undefined>
): string | null {
  if (platform === "darwin") {
    return path.join(
      homeDir,
      "Library",
      "Application Support",
      "Code",
      "User",
      "settings.json"
    );
  }
  if (platform === "win32") {
    const base =
      variables.APPDATA ?? path.join(homeDir, "AppData", "Roaming");
    return path.join(base, "Code", "User", "settings.json");
  }
  return path.join(homeDir, ".config", "Code", "User", "settings.json");
}

function formatAutoImportPath(homeDir: string, targetPath: string): string {
  const normalizedHome = path.resolve(homeDir);
  const normalizedTarget = path.resolve(targetPath);
  if (normalizedHome === normalizedTarget) {
    return "~";
  }
  if (normalizedTarget.startsWith(normalizedHome)) {
    const suffix = normalizedTarget.slice(normalizedHome.length);
    const trimmed = suffix.startsWith(path.sep)
      ? suffix.slice(1)
      : suffix;
    if (trimmed.length === 0) {
      return "~";
    }
    return `~/${trimmed.split(path.sep).join("/")}`;
  }
  return normalizedTarget.split(path.sep).join("/");
}

const rooCodeManifest = createServiceManifest<
  RooCodeConfigureOptions,
  RooCodeRemoveOptions
>({
  id: "roo-code",
  summary: "Configure Roo Code auto-import to use the Poe API.",
  configure: [
    ensureDirectory({
      path: ({ options }) => path.dirname(options.configPath),
      label: "Ensure Roo config directory"
    }),
    {
      kind: "transformFile",
      target: ({ options }) => options.configPath,
      label: "Merge Roo provider profile",
      async transform({ content, context }) {
        return buildRooConfigContent({
          fs: context.fs,
          options: context.options,
          current: content
        });
      }
    },
    ensureDirectory({
      path: ({ options }) => path.dirname(options.settingsPath),
      label: "Ensure VSCode settings directory"
    }),
    jsonMergeMutation({
      target: ({ options }) => options.settingsPath,
      label: "Set Roo auto-import path",
      value: ({ options }) => ({
        "roo-cline.autoImportSettingsPath": options.autoImportPath
      })
    })
  ],
  remove: [
    {
      kind: "transformFile",
      target: ({ options }) => options.configPath,
      label: "Remove Roo provider profile",
      async transform({ content, context }) {
        return pruneRooConfigContent({
          fs: context.fs,
          options: context.options,
          current: content
        });
      }
    }
  ]
});

export const rooCodeService: ProviderService<
  RooCodePaths,
  RooCodeConfigureOptions,
  RooCodeRemoveOptions
> = {
  ...rooCodeManifest,
  name: "roo-code",
  label: "Roo Code",
  disabled: true,
  resolvePaths(env) {
    const settingsPath = resolveVsCodeSettingsPath(
      env.platform,
      env.homeDir,
      env.variables
    );
    if (!settingsPath) {
      throw new Error(
        "Unable to determine VSCode settings path for the current platform."
      );
    }
    const configPath = env.resolveHomePath("Documents", "roo-config.json");
    return {
      configPath,
      settingsPath,
      autoImportPath: formatAutoImportPath(env.homeDir, configPath)
    };
  }
};
