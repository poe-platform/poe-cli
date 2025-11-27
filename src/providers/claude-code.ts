import path from "node:path";
import type { ProviderService } from "../cli/service-registry.js";
import type { FileSystem } from "../utils/file-system.js";
import type {
  CommandRunner,
  PrerequisiteDefinition
} from "../utils/prerequisites.js";
import {
  createBinaryExistsCheck,
  formatCommandRunnerResult
} from "../utils/prerequisites.js";
import {
  createServiceManifest,
  ensureDirectory,
  jsonMergeMutation,
  jsonPruneMutation,
  removeFileMutation,
  writeTemplateMutation
} from "../services/service-manifest.js";
import {
  runServiceInstall,
  type InstallContext,
  type ServiceInstallDefinition
} from "../services/service-install.js";
import {
  CLAUDE_MODEL_OPUS,
  CLAUDE_MODEL_SONNET,
  CLAUDE_MODEL_HAIKU
} from "../cli/constants.js";
import { makeExecutableMutation, quoteSinglePath } from "./provider-helpers.js";

export interface ClaudeCodePaths extends Record<string, string> {
  settingsPath: string;
  keyHelperPath: string;
  credentialsPath: string;
}

export type ClaudeCodeConfigureManifestOptions = {
  apiKey: string;
  settingsPath: string;
  keyHelperPath: string;
  credentialsPath: string;
  defaultModel: string;
};

export type ClaudeCodeRemoveManifestOptions = {
  settingsPath: string;
  keyHelperPath: string;
};

export interface ConfigureClaudeCodeOptions
  extends ClaudeCodeConfigureManifestOptions {
  fs: FileSystem;
}

export interface RemoveClaudeCodeOptions
  extends ClaudeCodeRemoveManifestOptions {
  fs: FileSystem;
}

export interface ClaudeCodeSpawnOptions {
  prompt: string;
  args: string[];
}

const KEY_HELPER_TEMPLATE_ID = "claude-code/anthropic_key.sh.hbs";
const KEY_HELPER_MODE = 0o700;
const CLAUDE_ENV_SHAPE = {
  apiKeyHelper: true,
  env: {
    ANTHROPIC_BASE_URL: true,
    ANTHROPIC_DEFAULT_HAIKU_MODEL: true,
    ANTHROPIC_DEFAULT_SONNET_MODEL: true,
    ANTHROPIC_DEFAULT_OPUS_MODEL: true
  },
  model: true
} as const;

const claudeCodeManifest = createServiceManifest<
  ClaudeCodeConfigureManifestOptions,
  ClaudeCodeRemoveManifestOptions
>({
  id: "claude-code",
  summary: "Configure Claude Code to route through Poe.",
  prerequisites: {
    after: ["claude-cli-health"]
  },
  configure: [
    ensureDirectory({
      path: ({ options }) => path.dirname(options.settingsPath),
      label: "Ensure Claude settings directory"
    }),
    writeTemplateMutation({
      target: ({ options }) => options.keyHelperPath,
      templateId: KEY_HELPER_TEMPLATE_ID,
      context: ({ options }) => ({
        credentialsPathLiteral: quoteSinglePath(options.credentialsPath)
      }),
      label: "Write API key helper script"
    }),
    makeExecutableMutation({
      target: ({ options }) => options.keyHelperPath,
      label: "Make API key helper executable",
      mode: KEY_HELPER_MODE
    }),
    jsonMergeMutation({
      target: ({ options }) => options.settingsPath,
      label: "Merge Claude settings",
      value: ({ options }) => ({
        apiKeyHelper: options.keyHelperPath,
        env: {
          ANTHROPIC_BASE_URL: "https://api.poe.com",
          ANTHROPIC_DEFAULT_HAIKU_MODEL: CLAUDE_MODEL_HAIKU,
          ANTHROPIC_DEFAULT_SONNET_MODEL: CLAUDE_MODEL_SONNET,
          ANTHROPIC_DEFAULT_OPUS_MODEL: CLAUDE_MODEL_OPUS
        },
        model: options.defaultModel
      })
    })
  ],
  remove: [
    jsonPruneMutation({
      target: ({ options }) => options.settingsPath,
      label: "Prune Claude settings",
      shape: () => CLAUDE_ENV_SHAPE
    }),
    removeFileMutation({
      target: ({ options }) => options.keyHelperPath,
      label: "Remove API key helper script"
    })
  ]
});

export const CLAUDE_CODE_INSTALL_DEFINITION: ServiceInstallDefinition = {
  id: "claude-code",
  summary: "Claude CLI",
  check: createBinaryExistsCheck(
    "claude",
    "claude-cli-binary",
    "Claude CLI binary must exist"
  ),
  steps: [
    {
      id: "install-claude-cli-npm",
      description: "Install Claude CLI via npm",
      command: "npm",
      args: ["install", "-g", "@anthropic-ai/claude-code"]
    }
  ],
  successMessage: "Installed Claude CLI via npm."
};

export interface SpawnClaudeCodeOptions {
  prompt: string;
  args?: string[];
  runCommand: CommandRunner;
}

export type InstallClaudeCodeOptions = InstallContext;

function createClaudeCliHealthCheck(): PrerequisiteDefinition {
  return {
    id: "claude-cli-health",
    description: "Claude CLI health check must succeed",
    async run({ runCommand }) {
      const result = await spawnClaudeCode({
        prompt: "Output exactly: CLAUDE_CODE_OK",
        runCommand
      });
      if (result.exitCode !== 0) {
        const detail = formatCommandRunnerResult(result);
        throw new Error(
          [
            `Claude CLI health check failed with exit code ${result.exitCode}.`,
            detail
          ].join("\n")
        );
      }
      const output = result.stdout.trim();
      if (output !== "CLAUDE_CODE_OK") {
        const detail = formatCommandRunnerResult(result);
        throw new Error(
          [
            `Claude CLI health check failed: expected "CLAUDE_CODE_OK" but received "${output}".`,
            detail
          ].join("\n")
        );
      }
    }
  };
}

export const claudeCodeService: ProviderService<
  ClaudeCodePaths,
  ClaudeCodeConfigureManifestOptions,
  ClaudeCodeRemoveManifestOptions,
  ClaudeCodeSpawnOptions
> = {
  ...claudeCodeManifest,
  name: "claude-code",
  label: "Claude Code",
  branding: {
    colors: {
      dark: "#C15F3C",
      light: "#C15F3C"
    }
  },
  resolvePaths(env) {
    return {
      settingsPath: env.resolveHomePath(".claude", "settings.json"),
      keyHelperPath: env.resolveHomePath(".claude", "anthropic_key.sh"),
      credentialsPath: env.credentialsPath
    };
  },
  registerPrerequisites(manager) {
    manager.registerAfter(createClaudeCliHealthCheck());
  },
  async install(context) {
    await runServiceInstall(CLAUDE_CODE_INSTALL_DEFINITION, {
      isDryRun: context.logger.context.dryRun,
      runCommand: context.command.runCommand,
      logger: (message) => context.logger.info(message)
    });
  },
  async spawn(context, options) {
    const defaults = [
      "-p",
      options.prompt,
      "--allowedTools",
      "Bash,Read",
      "--permission-mode",
      "acceptEdits",
      "--output-format",
      "text"
    ];
    const args = [...defaults, ...(options.args ?? [])];
    return context.command.runCommand("claude", args);
  }
};
