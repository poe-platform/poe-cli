import path from "node:path";
import type { FileSystem } from "../utils/file-system.js";
import type { PrerequisiteManager } from "../utils/prerequisites.js";
import {
  ensureDirectory,
  jsonMergeMutation,
  jsonPruneMutation,
  runServiceConfigure,
  runServiceRemove,
  type ServiceManifest,
  type ServiceRunOptions
} from "./service-manifest.js";

const CLAUDE_ENV_SHAPE = {
  env: {
    POE_API_KEY: true,
    ANTHROPIC_BASE_URL: true,
    ANTHROPIC_API_KEY: true
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
    jsonMergeMutation({
      target: ({ options }) => options.settingsPath,
      label: "Merge Claude settings",
      value: ({ options }) => ({
        env: {
          POE_API_KEY: options.apiKey,
          ANTHROPIC_BASE_URL: "https://api.poe.com",
          ANTHROPIC_API_KEY: options.apiKey
        }
      })
    })
  ],
  remove: [
    jsonPruneMutation({
      target: ({ options }) => options.settingsPath,
      label: "Prune Claude settings",
      shape: () => CLAUDE_ENV_SHAPE
    })
  ]
};

export interface ConfigureClaudeCodeOptions {
  fs: FileSystem;
  apiKey: string;
  settingsPath: string;
}

export interface RemoveClaudeCodeOptions {
  fs: FileSystem;
  settingsPath: string;
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
  prerequisites.registerBefore({
    id: "claude-cli-binary",
    description: "Claude CLI binary must exist",
    async run({ runCommand }) {
      const result = await runCommand("which", ["claude"]);
      if (result.exitCode !== 0) {
        throw new Error("Claude CLI binary not found on PATH.");
      }
    }
  });

  prerequisites.registerAfter({
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
  });
}
