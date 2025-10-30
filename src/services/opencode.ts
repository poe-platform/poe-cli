import path from "node:path";
import type { FileSystem } from "../utils/file-system.js";
import type { JsonObject } from "../utils/json.js";
import type {
  CommandRunner,
  CommandRunnerResult,
  PrerequisiteDefinition,
  PrerequisiteManager
} from "../utils/prerequisites.js";
import {
  createBinaryExistsCheck,
  formatCommandRunnerResult
} from "../utils/prerequisites.js";
import {
  ensureDirectory,
  jsonMergeMutation,
  jsonPruneMutation,
  removeFileMutation,
  runServiceConfigure,
  runServiceRemove,
  type ServiceManifest,
  type ServiceRunOptions
} from "./service-manifest.js";
import {
  runServiceInstall,
  type InstallContext,
  type ServiceInstallDefinition
} from "./service-install.js";

const OPEN_CODE_CONFIG_TEMPLATE: JsonObject = {
  $schema: "https://opencode.ai/config.json",
  provider: {
    poe: {
      npm: "@ai-sdk/openai-compatible",
      name: "poe.com",
      options: {
        baseURL: "https://api.poe.com/v1"
      },
      models: {
        "Claude-Sonnet-4.5": {
          name: "Claude Sonnet 4.5"
        },
        "GPT-5-Codex": {
          name: "GPT-5-Codex"
        }
      }
    }
  }
};

const OPEN_CODE_CONFIG_SHAPE: JsonObject = {
  provider: {
    poe: true
  }
};

const OPEN_CODE_AUTH_SHAPE: JsonObject = {
  poe: true
};

export interface ConfigureOpenCodeOptions {
  fs: FileSystem;
  configPath: string;
  authPath: string;
  apiKey: string;
}

export interface RemoveOpenCodeOptions {
  fs: FileSystem;
  configPath: string;
  authPath: string;
}

export interface SpawnOpenCodeOptions {
  prompt: string;
  args?: string[];
  runCommand: CommandRunner;
}

const OPEN_CODE_MANIFEST: ServiceManifest<
  ConfigureOpenCodeOptions,
  RemoveOpenCodeOptions
> = {
  id: "opencode",
  summary: "Configure OpenCode CLI to use the Poe API.",
  prerequisites: {
    after: ["opencode-cli-health"]
  },
  configure: [
    ensureDirectory({
      path: ({ options }) => path.dirname(options.configPath),
      label: "Ensure OpenCode config directory"
    }),
    ensureDirectory({
      path: ({ options }) => path.dirname(options.authPath),
      label: "Ensure OpenCode auth directory"
    }),
    jsonMergeMutation({
      target: ({ options }) => options.configPath,
      label: "Merge OpenCode config",
      value: () => OPEN_CODE_CONFIG_TEMPLATE
    }),
    jsonMergeMutation({
      target: ({ options }) => options.authPath,
      label: "Merge OpenCode auth",
      value: ({ options }) =>
        ({
          poe: {
            type: "api",
            key: options.apiKey
          }
        }) as JsonObject
    })
  ],
  remove: [
    jsonPruneMutation({
      target: ({ options }) => options.configPath,
      label: "Prune OpenCode config",
      shape: () => OPEN_CODE_CONFIG_SHAPE
    }),
    jsonPruneMutation({
      target: ({ options }) => options.authPath,
      label: "Prune OpenCode auth",
      shape: () => OPEN_CODE_AUTH_SHAPE
    }),
    removeFileMutation({
      target: ({ options }) => options.authPath,
      label: "Delete OpenCode auth when empty",
      whenEmpty: true
    })
  ]
};

const OPEN_CODE_INSTALL_DEFINITION: ServiceInstallDefinition = {
  id: "opencode",
  summary: "OpenCode CLI",
  check: createOpenCodeBinaryCheck(),
  steps: [
    {
      id: "install-opencode-cli-npm",
      description: "Install OpenCode CLI via npm",
      command: "npm",
      args: ["install", "-g", "opencode-ai"]
    }
  ],
  postChecks: [createOpenCodeVersionCheck()],
  successMessage: "Installed OpenCode CLI via npm."
};

export async function configureOpenCode(
  options: ConfigureOpenCodeOptions,
  runOptions?: ServiceRunOptions
): Promise<void> {
  await runServiceConfigure(
    OPEN_CODE_MANIFEST,
    {
      fs: options.fs,
      options
    },
    runOptions
  );
}

export async function spawnOpenCode(
  options: SpawnOpenCodeOptions
): Promise<CommandRunnerResult> {
  const args = ["run", options.prompt, ...(options.args ?? [])];
  return options.runCommand("opencode", args);
}

export async function removeOpenCode(
  options: RemoveOpenCodeOptions,
  runOptions?: ServiceRunOptions
): Promise<boolean> {
  return runServiceRemove(
    OPEN_CODE_MANIFEST,
    {
      fs: options.fs,
      options
    },
    runOptions
  );
}

export async function installOpenCode(
  context: InstallContext
): Promise<boolean> {
  return runServiceInstall(OPEN_CODE_INSTALL_DEFINITION, context);
}

export function registerOpenCodePrerequisites(
  prerequisites: PrerequisiteManager
): void {
  prerequisites.registerAfter(createOpenCodeHealthCheck());
}

function createOpenCodeBinaryCheck(): PrerequisiteDefinition {
  return createBinaryExistsCheck(
    "opencode",
    "opencode-cli-binary",
    "OpenCode CLI binary must exist"
  );
}

function createOpenCodeVersionCheck(): PrerequisiteDefinition {
  return {
    id: "opencode-cli-version",
    description: "OpenCode CLI responds to --version",
    async run({ runCommand }) {
      const result = await runCommand("opencode", ["--version"]);
      if (result.exitCode !== 0) {
        throw new Error(
          `OpenCode CLI --version failed with exit code ${result.exitCode}.`
        );
      }
    }
  };
}

function createOpenCodeHealthCheck(): PrerequisiteDefinition {
  return {
    id: "opencode-cli-health",
    description: "OpenCode CLI health check must succeed",
    async run({ runCommand }) {
      const result = await spawnOpenCode({
        prompt: "Output exactly: OPEN_CODE_OK",
        runCommand
      });
      if (result.exitCode !== 0) {
        const detail = formatCommandRunnerResult(result);
        throw new Error(
          [
            `OpenCode CLI health check failed with exit code ${result.exitCode}.`,
            detail
          ].join("\n")
        );
      }
      const output = result.stdout.trim();
      if (output !== "OPEN_CODE_OK") {
        const detail = formatCommandRunnerResult(result);
        throw new Error(
          [
            `OpenCode CLI health check failed: expected "OPEN_CODE_OK" but received "${output}".`,
            detail
          ].join("\n")
        );
      }
    }
  };
}
