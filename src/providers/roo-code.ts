import path from "node:path";
import crypto from "node:crypto";
import type { ProviderService } from "../cli/service-registry.js";
import {
  deepMergeJson,
  isJsonObject,
  type JsonObject
} from "../utils/json.js";
import {
  readJsonFile,
  writeJsonFile
} from "./provider-helpers.js";

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

async function mergeRooConfig(
  fs: FileSystem,
  options: RooCodeConfigureOptions
): Promise<void> {
  const { data, raw } = await readJsonFile(fs, options.configPath);
  const nextConfig: JsonObject = { ...data };

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

  await writeJsonFile(fs, options.configPath, nextConfig, raw);
}

async function removeRooConfig(
  fs: FileSystem,
  options: RooCodeRemoveOptions
): Promise<boolean> {
  const { data, raw } = await readJsonFile(fs, options.configPath);
  if (!isJsonObject(data.providerProfiles)) {
    return false;
  }

  const providerProfiles = cloneObject(data.providerProfiles);
  const apiConfigs = cloneObject(providerProfiles.apiConfigs);
  if (!(options.configName in apiConfigs)) {
    return false;
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

  const nextConfig: JsonObject = { ...data, providerProfiles };
  return writeJsonFile(fs, options.configPath, nextConfig, raw);
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

export const rooCodeService: ProviderService<
  RooCodePaths,
  RooCodeConfigureOptions,
  RooCodeRemoveOptions
> = {
  id: "roo-code",
  summary: "Configure Roo Code auto-import to use the Poe API.",
  async configure(context) {
    const { fs, options } = context;
    await fs.mkdir(path.dirname(options.configPath), { recursive: true });
    await mergeRooConfig(fs, options);
    await fs.mkdir(path.dirname(options.settingsPath), { recursive: true });
    const settingsDoc = await readJsonFile(fs, options.settingsPath);
    const mergedSettings = deepMergeJson(settingsDoc.data, {
      "roo-cline.autoImportSettingsPath": options.autoImportPath
    } as JsonObject);
    await writeJsonFile(fs, options.settingsPath, mergedSettings, settingsDoc.raw);
  },
  async remove(context) {
    const { fs, options } = context;
    return removeRooConfig(fs, options);
  },
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
