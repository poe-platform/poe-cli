import type { ProviderService } from "../cli/service-registry.js";
import type { CliEnvironment } from "../cli/environment.js";
import type { JsonObject } from "../utils/json.js";
import type { PrerequisiteDefinition } from "../utils/prerequisites.js";
import {
  createBinaryExistsCheck,
  formatCommandRunnerResult
} from "../utils/prerequisites.js";
import {
  runServiceInstall,
  type ServiceInstallDefinition
} from "../services/service-install.js";
import {
  createServiceManifest,
  ensureDirectory,
  jsonMergeMutation,
  jsonPruneMutation
} from "../services/service-manifest.js";

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

type OpenCodeConfigureContext = {
  env: CliEnvironment;
  apiKey: string;
};

type OpenCodeRemoveContext = {
  env: CliEnvironment;
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

const openCodeManifest = createServiceManifest<
  OpenCodeConfigureContext,
  OpenCodeRemoveContext
>({
  id: "opencode",
  summary: "Configure OpenCode CLI to use the Poe API.",
  prerequisites: {
    after: ["opencode-cli-health"]
  },
  configure: [
    ensureDirectory({
      path: "~/.config/opencode"
    }),
    ensureDirectory({
      path: "~/.local/share/opencode"
    }),
    jsonMergeMutation({
      target: "~/.config/opencode/config.json",
      value: () => OPEN_CODE_CONFIG_TEMPLATE
    }),
    jsonMergeMutation({
      target: "~/.local/share/opencode/auth.json",
      value: ({ options }) => ({
        poe: {
          type: "api",
          key: options.apiKey
        }
      })
    })
  ],
  remove: [
    jsonPruneMutation({
      target: "~/.config/opencode/config.json",
      shape: () => OPEN_CODE_CONFIG_SHAPE
    }),
    jsonPruneMutation({
      target: "~/.local/share/opencode/auth.json",
      shape: () => OPEN_CODE_AUTH_SHAPE
    })
  ]
});

export const openCodeService: ProviderService<
  Record<string, never>,
  OpenCodeConfigureContext,
  OpenCodeRemoveContext,
  { prompt: string; args?: string[] }
> = {
  ...openCodeManifest,
  name: "opencode",
  label: "OpenCode CLI",
  branding: {
    colors: {
      dark: "#4A4F55",
      light: "#2F3338"
    }
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
