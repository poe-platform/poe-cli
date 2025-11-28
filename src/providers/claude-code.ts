import type { CliEnvironment } from "../cli/environment.js";
import type { PrerequisiteDefinition } from "../utils/prerequisites.js";
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
  type InstallContext,
  type ServiceInstallDefinition
} from "../services/service-install.js";
import {
  CLAUDE_MODEL_OPUS,
  CLAUDE_MODEL_SONNET,
  CLAUDE_MODEL_HAIKU
} from "../cli/constants.js";
import { makeExecutableMutation, quoteSinglePath } from "./provider-helpers.js";
import { createProvider } from "./create-provider.js";

type ClaudeCodeConfigureContext = {
  env: CliEnvironment;
  apiKey: string;
  defaultModel: string;
};

type ClaudeCodeRemoveContext = {
  env: CliEnvironment;
};

type ClaudeCodeSpawnOptions = {
  prompt: string;
  args?: string[];
};

const claudeCodeManifest = createServiceManifest<
  ClaudeCodeConfigureContext,
  ClaudeCodeRemoveContext
>({
  id: "claude-code",
  summary: "Configure Claude Code to route through Poe.",
  hooks: {
    after: ["claude-cli-health"]
  },
  configure: [
    ensureDirectory({
      path: "~/.claude"
    }),
    writeTemplateMutation({
      target: "~/.claude/anthropic_key.sh",
      templateId: "claude-code/anthropic_key.sh.hbs",
      context: ({ env }) => ({
        credentialsPathLiteral: quoteSinglePath(env.credentialsPath)
      })
    }),
    makeExecutableMutation({
      target: "~/.claude/anthropic_key.sh",
      mode: 0o700
    }),
    jsonMergeMutation({
      target: "~/.claude/settings.json",
      value: ({ options, env }) => ({
        apiKeyHelper: env.resolveHomePath(".claude", "anthropic_key.sh"),
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
      target: "~/.claude/settings.json",
      shape: () => ({
        apiKeyHelper: true,
        env: {
          ANTHROPIC_BASE_URL: true,
          ANTHROPIC_DEFAULT_HAIKU_MODEL: true,
          ANTHROPIC_DEFAULT_SONNET_MODEL: true,
          ANTHROPIC_DEFAULT_OPUS_MODEL: true
        },
        model: true
      })
    }),
    removeFileMutation({
      target: "~/.claude/anthropic_key.sh"
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

export type InstallClaudeCodeOptions = InstallContext;

const CLAUDE_SPAWN_DEFAULTS = [
  "--allowedTools",
  "Bash,Read",
  "--permission-mode",
  "acceptEdits",
  "--output-format",
  "text"
] as const;

function buildClaudeArgs(prompt: string, extraArgs?: string[]): string[] {
  return ["-p", prompt, ...CLAUDE_SPAWN_DEFAULTS, ...(extraArgs ?? [])];
}

function createClaudeCliHealthCheck(): PrerequisiteDefinition {
  return {
    id: "claude-cli-health",
    description: "Claude CLI health check must succeed",
    async run({ runCommand }) {
      const args = buildClaudeArgs("Output exactly: CLAUDE_CODE_OK");
      const result = await runCommand("claude", args);
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

export const claudeCodeService = createProvider<
  Record<string, never>,
  ClaudeCodeConfigureContext,
  ClaudeCodeRemoveContext,
  ClaudeCodeSpawnOptions
>({
  name: "claude-code",
  label: "Claude Code",
  branding: {
    colors: {
      dark: "#C15F3C",
      light: "#C15F3C"
    }
  },
  hooks: {
    after: [createClaudeCliHealthCheck()]
  },
  manifest: claudeCodeManifest,
  install: CLAUDE_CODE_INSTALL_DEFINITION,
  spawn(context, options) {
    const args = buildClaudeArgs(options.prompt, options.args);
    return context.command.runCommand("claude", args);
  }
});
