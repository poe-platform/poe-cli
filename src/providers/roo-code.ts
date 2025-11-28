import path from "node:path";
import crypto from "node:crypto";
import type { ProviderService } from "../cli/service-registry.js";
import type { CliEnvironment } from "../cli/environment.js";
import type { FileSystem } from "../utils/file-system.js";
import { isJsonObject, type JsonObject } from "../utils/json.js";
import {
  createServiceManifest,
  ensureDirectory,
  jsonMergeMutation
} from "../services/service-manifest.js";

const DEFAULT_RATE_LIMIT_SECONDS = 0;

function resolveRooConfigPath(env: CliEnvironment): string {
  return env.resolveHomePath("Documents", "roo-config.json");
}

function resolveRooSettingsPath(env: CliEnvironment): string {
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
  return settingsPath;
}

function resolveRooAutoImportPath(env: CliEnvironment): string {
  return formatAutoImportPath(env.homeDir, resolveRooConfigPath(env));
}

type RooCodeConfigureContext = {
  env: CliEnvironment;
  configName: string;
  apiKey: string;
  model: string;
  baseUrl: string;
  rateLimitSeconds?: number;
};

type RooCodeRemoveContext = {
  env: CliEnvironment;
  configName: string;
};

async function buildRooConfigContent(input: {
  fs: FileSystem;
  options: RooCodeConfigureContext;
  current: string | null;
}): Promise<{ content: string; changed: boolean }> {
  const document = await readJsonDocument({
    fs: input.fs,
    env: input.options.env,
    current: input.current
  });
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
  options: RooCodeRemoveContext;
  current: string | null;
}): Promise<{ content: string | null; changed: boolean }> {
  const document = await readJsonDocument({
    fs: input.fs,
    env: input.options.env,
    current: input.current
  });
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
  env: CliEnvironment;
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
      resolveRooConfigPath(input.env),
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
  options: RooCodeConfigureContext
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
  options: RooCodeRemoveContext
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
  RooCodeConfigureContext,
  RooCodeRemoveContext
>({
  id: "roo-code",
  summary: "Configure Roo Code auto-import to use the Poe API.",
  configure: [
    ensureDirectory({
      path: ({ options }) => options.env.resolveHomePath("Documents"),
      label: "Ensure Roo config directory"
    }),
    {
      kind: "transformFile",
      target: ({ options }) => resolveRooConfigPath(options.env),
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
      path: ({ options }) =>
        path.dirname(resolveRooSettingsPath(options.env)),
      label: "Ensure VSCode settings directory"
    }),
    jsonMergeMutation({
      target: ({ options }) => resolveRooSettingsPath(options.env),
      label: "Set Roo auto-import path",
      value: ({ options }) => ({
        "roo-cline.autoImportSettingsPath": resolveRooAutoImportPath(
          options.env
        )
      })
    })
  ],
  remove: [
    {
      kind: "transformFile",
      target: ({ options }) => resolveRooConfigPath(options.env),
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
  Record<string, never>,
  RooCodeConfigureContext,
  RooCodeRemoveContext
> = {
  ...rooCodeManifest,
  name: "roo-code",
  label: "Roo Code",
  disabled: true,
  resolvePaths() {
    return {};
  }
};
