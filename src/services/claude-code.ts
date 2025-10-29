import path from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { FileSystem } from "../utils/file-system.js";
import type {
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

const execAsync = promisify(exec);

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
      templateId: "claude-code/anthropic_key.sh",
      context: ({ options }) => ({
        credentialsPath: options.credentialsPath
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
      args: ["install", "-g", "claude-code"]
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

function createChmodMutation(): ServiceMutation<ConfigureClaudeCodeOptions> {
  return {
    kind: "transformFile",
    target: ({ options }) => options.keyHelperPath,
    label: "Make API key helper executable",
    async transform({ content, context }) {
      if (content) {
        await execAsync(`chmod +x "${context.options.keyHelperPath}"`);
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
      const result = await runCommand("which", ["claude"]);
      if (result.exitCode !== 0) {
        throw new Error("Claude CLI binary not found on PATH.");
      }
    }
  };
}

function createClaudeCliHealthCheck(): PrerequisiteDefinition {
  return {
    id: "claude-cli-health",
    description: "Claude CLI health check must succeed",
    async run({ runCommand }) {
      const result = await runCommand("claude", [
        "-p",
        "Output exactly: CLAUDE_CODE_OK",
        "--output-format",
        "text"
      ]);
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
