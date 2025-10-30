import {
  configureClaudeCode,
  installClaudeCode,
  registerClaudeCodePrerequisites,
  removeClaudeCode,
  spawnClaudeCode
} from "../services/claude-code.js";
import type { ProviderAdapter } from "../cli/service-registry.js";
import type { ServiceMutationHooks } from "../services/service-manifest.js";

export interface ClaudeCodePaths extends Record<string, string> {
  settingsPath: string;
  keyHelperPath: string;
  credentialsPath: string;
}

export interface ClaudeCodeConfigureOptions {
  apiKey: string;
  mutationHooks?: ServiceMutationHooks;
}

export interface ClaudeCodeRemoveOptions {
  mutationHooks?: ServiceMutationHooks;
}

export interface ClaudeCodeSpawnOptions {
  prompt: string;
  args: string[];
}

export const claudeCodeAdapter: ProviderAdapter<
  ClaudeCodePaths,
  ClaudeCodeConfigureOptions,
  ClaudeCodeRemoveOptions,
  ClaudeCodeSpawnOptions
> = {
  name: "claude-code",
  label: "Claude Code",
  supportsSpawn: true,
  resolvePaths(env) {
    return {
      settingsPath: env.resolveHomePath(".claude", "settings.json"),
      keyHelperPath: env.resolveHomePath(".claude", "anthropic_key.sh"),
      credentialsPath: env.credentialsPath
    };
  },
  registerPrerequisites(manager) {
    registerClaudeCodePrerequisites(manager);
  },
  async install(context) {
    await installClaudeCode({
      isDryRun: context.logger.context.dryRun,
      runCommand: context.command.runCommand,
      logger: (message) => context.logger.info(message)
    });
  },
  async configure(context, options) {
    await configureClaudeCode(
      {
        fs: context.command.fs,
        apiKey: options.apiKey,
        settingsPath: context.paths.settingsPath,
        keyHelperPath: context.paths.keyHelperPath,
        credentialsPath: context.paths.credentialsPath
      },
      options.mutationHooks ? { hooks: options.mutationHooks } : undefined
    );
  },
  async remove(context, options) {
    return await removeClaudeCode(
      {
        fs: context.command.fs,
        settingsPath: context.paths.settingsPath,
        keyHelperPath: context.paths.keyHelperPath
      },
      options.mutationHooks ? { hooks: options.mutationHooks } : undefined
    );
  },
  async spawn(context, options) {
    return await spawnClaudeCode({
      prompt: options.prompt,
      args: options.args,
      runCommand: context.command.runCommand
    });
  }
};
