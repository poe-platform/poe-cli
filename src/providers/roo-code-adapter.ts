import path from "node:path";
import {
  configureRooCode,
  removeRooCode
} from "../services/roo-code.js";
import type { ProviderAdapter } from "../cli/service-registry.js";
import type { ServiceMutationHooks } from "../services/service-manifest.js";

export interface RooCodePaths extends Record<string, string> {
  configPath: string;
  settingsPath: string;
  autoImportPath: string;
}

export interface RooCodeConfigureOptions {
  apiKey: string;
  model: string;
  baseUrl: string;
  configName: string;
  mutationHooks?: ServiceMutationHooks;
}

export interface RooCodeRemoveOptions {
  configName: string;
  mutationHooks?: ServiceMutationHooks;
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

export const rooCodeAdapter: ProviderAdapter<
  RooCodePaths,
  RooCodeConfigureOptions,
  RooCodeRemoveOptions
> = {
  name: "roo-code",
  label: "Roo Code",
  supportsSpawn: false,
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
  },
  async configure(context, options) {
    await configureRooCode(
      {
        fs: context.command.fs,
        configPath: context.paths.configPath,
        settingsPath: context.paths.settingsPath,
        configName: options.configName,
        apiKey: options.apiKey,
        model: options.model,
        baseUrl: options.baseUrl,
        autoImportPath: context.paths.autoImportPath
      },
      options.mutationHooks ? { hooks: options.mutationHooks } : undefined
    );
  },
  async remove(context, options) {
    const removed = await removeRooCode(
      {
        fs: context.command.fs,
        configPath: context.paths.configPath,
        settingsPath: context.paths.settingsPath,
        configName: options.configName,
        autoImportPath: context.paths.autoImportPath
      },
        options.mutationHooks ? { hooks: options.mutationHooks } : undefined
    );
    return removed;
  }
};
