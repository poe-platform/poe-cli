import {
  configureCodex,
  installCodex,
  registerCodexPrerequisites,
  removeCodex,
  spawnCodex
} from "../services/codex.js";
import type { ProviderAdapter, ProviderContext } from "../cli/service-registry.js";
import type { ServiceMutationHooks } from "../services/service-manifest.js";

export interface CodexPaths extends Record<string, string> {
  configPath: string;
}

export interface CodexConfigureOptions {
  apiKey: string;
  model: string;
  reasoningEffort: string;
  mutationHooks?: ServiceMutationHooks;
}

export interface CodexSpawnOptions {
  prompt: string;
  args: string[];
}

export interface CodexRemoveOptions {
  mutationHooks?: ServiceMutationHooks;
}

function resolveCodexPaths(context: ProviderContext<CodexPaths>): CodexPaths {
  return context.paths;
}

export const codexAdapter: ProviderAdapter<
  CodexPaths,
  CodexConfigureOptions,
  CodexRemoveOptions,
  CodexSpawnOptions
> = {
  name: "codex",
  label: "Codex",
  supportsSpawn: true,
  resolvePaths(env) {
    return {
      configPath: env.resolveHomePath(".codex", "config.toml")
    };
  },
  registerPrerequisites(manager) {
    registerCodexPrerequisites(manager);
  },
  async install(context) {
    await installCodex({
      isDryRun: context.logger.context.dryRun,
      runCommand: context.command.runCommand,
      logger: (message) => context.logger.info(message)
    });
  },
  async configure(context, options) {
    const paths = resolveCodexPaths(context);
    await configureCodex(
      {
        fs: context.command.fs,
        configPath: paths.configPath,
        apiKey: options.apiKey,
        model: options.model,
        reasoningEffort: options.reasoningEffort
      },
      options.mutationHooks ? { hooks: options.mutationHooks } : undefined
    );
  },
  async remove(context, options) {
    const paths = resolveCodexPaths(context);
    return await removeCodex(
      {
        fs: context.command.fs,
        configPath: paths.configPath
      },
      options.mutationHooks ? { hooks: options.mutationHooks } : undefined
    );
  },
  async spawn(context, options) {
    return await spawnCodex({
      prompt: options.prompt,
      args: options.args,
      runCommand: context.command.runCommand
    });
  }
};
