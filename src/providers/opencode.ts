import path from "node:path";
import type { ProviderService } from "../cli/service-registry.js";
import type { JsonObject } from "../utils/json.js";
import type { PrerequisiteDefinition } from "../utils/prerequisites.js";
import {
  createBinaryExistsCheck,
  formatCommandRunnerResult
} from "../utils/prerequisites.js";
import {
  ensureDirectory,
  jsonMergeMutation,
  jsonPruneMutation,
  removeFileMutation,
  runServiceMutations,
  type ServiceMutation
} from "../services/service-manifest.js";
import {
  runServiceInstall,
  type ServiceInstallDefinition
} from "../services/service-install.js";

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
        "GPT-5.1-Codex": {
          name: "GPT-5.1-Codex"
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

export interface OpenCodePaths extends Record<string, string> {
  configPath: string;
  authPath: string;
}

export type OpenCodeConfigureOptions = {
  configPath: string;
  authPath: string;
  apiKey: string;
};

export type OpenCodeRemoveOptions = {
  configPath: string;
  authPath: string;
};

export const OPEN_CODE_INSTALL_DEFINITION: ServiceInstallDefinition = {
  id: "opencode",
  summary: "OpenCode CLI",
  check: createBinaryExistsCheck(
    "opencode",
    "opencode-cli-binary",
    "OpenCode CLI binary must exist"
  ),
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
      const args = ["run", "Output exactly: OPEN_CODE_OK"];
      const result = await runCommand("opencode", args);
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

export const openCodeService: ProviderService<
  OpenCodePaths,
  OpenCodeConfigureOptions,
  OpenCodeRemoveOptions,
  { prompt: string; args?: string[] }
> = {
  id: "opencode",
  summary: "Configure OpenCode CLI to use the Poe API.",
  prerequisites: {
    after: ["opencode-cli-health"]
  },
  async configure(context, runOptions) {
    const mutations: ServiceMutation<OpenCodeConfigureOptions>[] = [
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
    ];
    await runServiceMutations(mutations, context, {
      manifestId: "opencode",
      hooks: runOptions?.hooks,
      trackChanges: false
    });
  },
  remove(context, runOptions) {
    const mutations: ServiceMutation<OpenCodeRemoveOptions>[] = [
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
    ];
    return runServiceMutations(mutations, context, {
      manifestId: "opencode",
      hooks: runOptions?.hooks,
      trackChanges: true
    });
  },
  name: "opencode",
  label: "OpenCode CLI",
  branding: {
    colors: {
      dark: "#4A4F55",
      light: "#2F3338"
    }
  },
  resolvePaths(env) {
    return {
      configPath: env.resolveHomePath(".config", "opencode", "config.json"),
      authPath: env.resolveHomePath(".local", "share", "opencode", "auth.json")
    };
  },
  registerPrerequisites(manager) {
    manager.registerAfter(createOpenCodeHealthCheck());
  },
  async install(context) {
    await runServiceInstall(OPEN_CODE_INSTALL_DEFINITION, {
      isDryRun: context.logger.context.dryRun,
      runCommand: context.command.runCommand,
      logger: (message) => context.logger.info(message)
    });
  },
  async spawn(context, options) {
    const args = ["run", options.prompt, ...(options.args ?? [])];
    return context.command.runCommand("opencode", args);
  }
};
