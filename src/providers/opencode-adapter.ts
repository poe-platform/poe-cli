import {
  configureOpenCode,
  installOpenCode,
  registerOpenCodePrerequisites,
  removeOpenCode,
  spawnOpenCode
} from "../services/opencode.js";
import type { ProviderAdapter } from "../cli/service-registry.js";
import type { ServiceMutationHooks } from "../services/service-manifest.js";

export interface OpenCodePaths extends Record<string, string> {
  configPath: string;
  authPath: string;
}

export interface OpenCodeConfigureOptions {
  apiKey: string;
  mutationHooks?: ServiceMutationHooks;
}

export interface OpenCodeRemoveOptions {
  mutationHooks?: ServiceMutationHooks;
}

export interface OpenCodeSpawnOptions {
  prompt: string;
  args: string[];
}

export const openCodeAdapter: ProviderAdapter<
  OpenCodePaths,
  OpenCodeConfigureOptions,
  OpenCodeRemoveOptions,
  OpenCodeSpawnOptions
> = {
  name: "opencode",
  label: "OpenCode CLI",
  branding: {
    colors: {
      dark: "#4A4F55",
      light: "#2F3338"
    }
  },
  supportsSpawn: true,
  resolvePaths(env) {
    return {
      configPath: env.resolveHomePath(".config", "opencode", "config.json"),
      authPath: env.resolveHomePath(".local", "share", "opencode", "auth.json")
    };
  },
  registerPrerequisites(manager) {
    registerOpenCodePrerequisites(manager);
  },
  async install(context) {
    await installOpenCode({
      isDryRun: context.logger.context.dryRun,
      runCommand: context.command.runCommand,
      logger: (message) => context.logger.info(message)
    });
  },
  async configure(context, options) {
    await configureOpenCode(
      {
        fs: context.command.fs,
        configPath: context.paths.configPath,
        authPath: context.paths.authPath,
        apiKey: options.apiKey
      },
      options.mutationHooks ? { hooks: options.mutationHooks } : undefined
    );
  },
  async remove(context, options) {
    return await removeOpenCode(
      {
        fs: context.command.fs,
        configPath: context.paths.configPath,
        authPath: context.paths.authPath
      },
      options.mutationHooks ? { hooks: options.mutationHooks } : undefined
    );
  },
  async spawn(context, options) {
    return await spawnOpenCode({
      prompt: options.prompt,
      args: options.args,
      runCommand: context.command.runCommand
    });
  }
};
