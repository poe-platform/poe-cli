import path from "node:path";
import type { FileSystem } from "../utils/file-system.js";
import type {
  CommandRunner,
  CommandRunnerResult,
  PrerequisiteDefinition,
  PrerequisiteManager
} from "../utils/prerequisites.js";
import {
  ensureDirectory,
  jsonMergeMutation,
  jsonPruneMutation,
  runServiceConfigure,
  runServiceRemove,
  writeTemplateMutation,
  type ServiceManifest,
  type ServiceRunOptions,
  type ServiceMutation
} from "./service-manifest.js";
import {
  runServiceInstall,
  type InstallContext,
  type ServiceInstallDefinition
} from "./service-install.js";

const KEY_HELPER_TEMPLATE_ID = "claude-code/anthropic_key.sh.hbs";
const KEY_HELPER_MODE = 0o700;

const CLAUDE_ENV_SHAPE = {
  apiKeyHelper: true,
  env: {
    ANTHROPIC_BASE_URL: true
  }
} as const;

const CLAUDE_CODE_MANIFEST: ServiceManifest<
  ConfigureClaudeCodeOptions,
  RemoveClaudeCodeOptions
> = {
  id: "claude-code",
  summary: "Configure Claude Code to route through Poe.",
  prerequisites: {
    before: ["claude-cli-binary"],
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
        credentialsPathLiteral: toSingleQuotedLiteral(options.credentialsPath)
      }),
      label: "Write API key helper script"
    }),
    createChmodMutation(),
    jsonMergeMutation({
      target: ({ options }) => options.settingsPath,
      label: "Merge Claude settings",
      value: ({ options }) => ({
        apiKeyHelper: options.keyHelperPath,
        env: {
          ANTHROPIC_BASE_URL: "https://api.poe.com"
        }
      })
    })
  ],
  remove: [
    jsonPruneMutation({
      target: ({ options }) => options.settingsPath,
      label: "Prune Claude settings",
      shape: () => CLAUDE_ENV_SHAPE
    }),
    removeKeyHelperMutation()
  ]
};

const CLAUDE_CODE_INSTALL_DEFINITION: ServiceInstallDefinition = {
  id: "claude-code",
  summary: "Claude CLI",
  check: createClaudeCliBinaryCheck(),
  steps: [
    {
      id: "install-claude-cli-npm",
      description: "Install Claude CLI via npm",
      command: "npm",
      args: ["install", "-g", "@anthropic-ai/claude-code"]
    }
  ],
  postChecks: [createClaudeCliHealthCheck()],
  successMessage: "Installed Claude CLI via npm."
};

export interface ConfigureClaudeCodeOptions {
  fs: FileSystem;
  apiKey: string;
  settingsPath: string;
  keyHelperPath: string;
  credentialsPath: string;
}

export interface RemoveClaudeCodeOptions {
  fs: FileSystem;
  settingsPath: string;
  keyHelperPath: string;
}

export interface SpawnClaudeCodeOptions {
  prompt: string;
  args?: string[];
  runCommand: CommandRunner;
}

function createChmodMutation(): ServiceMutation<ConfigureClaudeCodeOptions> {
  return {
    kind: "transformFile",
    target: ({ options }) => options.keyHelperPath,
    label: "Make API key helper executable",
    async transform({ content, context }) {
      if (
        typeof context.fs.chmod === "function" &&
        content != null
      ) {
        await context.fs.chmod(context.options.keyHelperPath, KEY_HELPER_MODE);
      }
      return { content, changed: false };
    }
  };
}

function removeKeyHelperMutation(): ServiceMutation<RemoveClaudeCodeOptions> {
  return {
    kind: "removeFile",
    target: ({ options }) => options.keyHelperPath,
    label: "Remove API key helper script"
  };
}

function toSingleQuotedLiteral(targetPath: string): string {
  const escaped = targetPath.replace(/'/g, `'\\''`);
  return `'${escaped}'`;
}

export async function configureClaudeCode(
  options: ConfigureClaudeCodeOptions,
  runOptions?: ServiceRunOptions
): Promise<void> {
  await runServiceConfigure(
    CLAUDE_CODE_MANIFEST,
    {
      fs: options.fs,
      options
    },
    runOptions
  );
}

export async function spawnClaudeCode(
  options: SpawnClaudeCodeOptions
): Promise<CommandRunnerResult> {
  const defaults = [
    "-p",
    options.prompt,
    "--allowedTools",
    "Bash,Read",
    "--permission-mode",
    "acceptEdits"
  ];
  const args = [...defaults, ...(options.args ?? [])];
  return options.runCommand("claude", args);
}

export async function removeClaudeCode(
  options: RemoveClaudeCodeOptions,
  runOptions?: ServiceRunOptions
): Promise<boolean> {
  return runServiceRemove(
    CLAUDE_CODE_MANIFEST,
    {
      fs: options.fs,
      options
    },
    runOptions
  );
}

export function registerClaudeCodePrerequisites(
  prerequisites: PrerequisiteManager
): void {
  prerequisites.registerBefore(createClaudeCliBinaryCheck());
  prerequisites.registerAfter(createClaudeCliHealthCheck());
}

export async function installClaudeCode(
  context: InstallContext
): Promise<boolean> {
  return runServiceInstall(CLAUDE_CODE_INSTALL_DEFINITION, context);
}

function createClaudeCliBinaryCheck(): PrerequisiteDefinition {
  return {
    id: "claude-cli-binary",
    description: "Claude CLI binary must exist",
    async run({ runCommand }) {
      const detectors: Array<{ command: string; args: string[] }> = [
        { command: "which", args: ["claude"] },
        { command: "where", args: ["claude"] }
      ];

      for (const detector of detectors) {
        const result = await runCommand(detector.command, detector.args);
        if (result.exitCode === 0) {
          return;
        }
      }

      throw new Error("Claude CLI binary not found on PATH.");
    }
  };
}

function createClaudeCliHealthCheck(): PrerequisiteDefinition {
  return {
    id: "claude-cli-health",
    description: "Claude CLI health check must succeed",
    async run({ runCommand }) {
      const result = await spawnClaudeCode({
        prompt: "Output exactly: CLAUDE_CODE_OK",
        args: ["--output-format", "text"],
        runCommand
      });
      if (result.exitCode !== 0) {
        throw new Error(
          `Claude CLI health check failed with exit code ${result.exitCode}.`
        );
      }
      const output = result.stdout.trim();
      if (output !== "CLAUDE_CODE_OK") {
        throw new Error(
          `Claude CLI health check failed: expected "CLAUDE_CODE_OK" but received "${output}".`
        );
      }
    }
  };
}
