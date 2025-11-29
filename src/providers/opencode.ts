import type { CliEnvironment } from "../cli/environment.js";
import { OPEN_CODE_DEFAULT_MODEL } from "../cli/constants.js";
import type { JsonObject } from "../utils/json.js";
import type { HookDefinition } from "../utils/hooks.js";
import {
  createBinaryExistsCheck,
  createCommandExpectationHook
} from "../utils/hooks.js";
import { type ServiceInstallDefinition } from "../services/service-install.js";
import {
  ensureDirectory,
  jsonMergeMutation,
  jsonPruneMutation
} from "../services/service-manifest.js";
import { createProvider } from "./create-provider.js";
import { createBinaryVersionResolver } from "./versioned-provider.js";

const OPEN_CODE_CONFIG_TEMPLATE: JsonObject = {
  $schema: "https://opencode.ai/config.json",
  model: OPEN_CODE_DEFAULT_MODEL,
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
      command: "npm",
      args: ["install", "-g", "opencode-ai"]
    }
  ],
  postChecks: [createOpenCodeVersionCheck()],
  successMessage: "Installed OpenCode CLI via npm."
};

function createOpenCodeVersionCheck(): HookDefinition {
  return {
    id: "opencode-cli-version",
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

function getModelArgs(model = OPEN_CODE_DEFAULT_MODEL): string[] {
  return ["--model", model];
}

function createOpenCodeHealthCheck(): HookDefinition {
  const args = [
    ...getModelArgs(),
    "run",
    "Output exactly: OPEN_CODE_OK"
  ];
  return createCommandExpectationHook({
    id: "opencode-cli-health",
    command: "opencode",
    args,
    expectedOutput: "OPEN_CODE_OK"
  });
}

export const openCodeService = createProvider<
  Record<string, never>,
  OpenCodeConfigureContext,
  OpenCodeRemoveContext,
  { prompt: string; args?: string[] }
>({
  name: "opencode",
  label: "OpenCode CLI",
  id: "opencode",
  summary: "Configure OpenCode CLI to use the Poe API.",
  branding: {
    colors: {
      dark: "#4A4F55",
      light: "#2F3338"
    }
  },
  hooks: {
    after: [createOpenCodeHealthCheck()]
  },
  manifest: {
    "*": {
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
    }
  },
  versionResolver: createBinaryVersionResolver("opencode"),
  install: OPEN_CODE_INSTALL_DEFINITION,
  spawn(context, options) {
    const args = [
      ...getModelArgs(),
      "run",
      options.prompt,
      ...(options.args ?? [])
    ];
    return context.command.runCommand("opencode", args);
  }
});
