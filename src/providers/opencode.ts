import {
  DEFAULT_FRONTIER_MODEL,
  FRONTIER_MODELS,
  PROVIDER_NAME
} from "../cli/constants.js";
import type { JsonObject } from "../utils/json.js";
import type { CommandCheck } from "../utils/command-checks.js";
import {
  createBinaryExistsCheck,
  createCommandExpectationCheck
} from "../utils/command-checks.js";
import { type ServiceInstallDefinition } from "../services/service-install.js";
import {
  ensureDirectory,
  jsonMergeMutation,
  jsonPruneMutation
} from "../services/service-manifest.js";
import { createProvider } from "./create-provider.js";
import { createBinaryVersionResolver } from "./versioned-provider.js";

function providerModel(model?: string): string {
  const value = model ?? DEFAULT_FRONTIER_MODEL;
  const prefix = `${PROVIDER_NAME}/`;
  return value.startsWith(prefix) ? value : `${prefix}${value}`;
}

const FRONTIER_MODEL_RECORD = FRONTIER_MODELS.reduce<
  Record<string, { name: string }>
>((acc, id) => {
  acc[id] = { name: id };
  return acc;
}, {});

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

function createOpenCodeVersionCheck(): CommandCheck {
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

function getModelArgs(model?: string): string[] {
  return ["--model", providerModel(model)];
}

function createOpenCodeHealthCheck(): CommandCheck {
  const args = [
    ...getModelArgs(DEFAULT_FRONTIER_MODEL),
    "run",
    "Output exactly: OPEN_CODE_OK"
  ];
  return createCommandExpectationCheck({
    id: "opencode-cli-health",
    command: "opencode",
    args,
    expectedOutput: "OPEN_CODE_OK"
  });
}

export const openCodeService = createProvider({
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
  configurePrompts: {
    model: {
      label: "OpenCode model",
      defaultValue: DEFAULT_FRONTIER_MODEL,
      choices: FRONTIER_MODELS.map((id) => ({
        title: id,
        value: id
      }))
    }
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
          value: ({ options }) => {
            const { model } = (options ?? {}) as { model?: string };
            return {
              $schema: "https://opencode.ai/config.json",
              model: providerModel(model),
              provider: {
                [PROVIDER_NAME]: {
                  npm: "@ai-sdk/openai-compatible",
                  name: "poe.com",
                  options: {
                    baseURL: "https://api.poe.com/v1"
                  },
                  models: FRONTIER_MODEL_RECORD
                }
              }
            };
          }
        }),
        jsonMergeMutation({
          target: "~/.local/share/opencode/auth.json",
          value: ({ options }) => {
            const { apiKey } = (options ?? {}) as { apiKey?: string };
            return {
              [PROVIDER_NAME]: {
                type: "api",
                key: apiKey ?? ""
              }
            };
          }
        })
      ],
      remove: [
        jsonPruneMutation({
          target: "~/.config/opencode/config.json",
          shape: (): JsonObject => ({
            provider: {
              [PROVIDER_NAME]: true
            }
          })
        }),
        jsonPruneMutation({
          target: "~/.local/share/opencode/auth.json",
          shape: (): JsonObject => ({
            [PROVIDER_NAME]: true
          })
        })
      ]
    }
  },
  versionResolver: createBinaryVersionResolver("opencode"),
  install: OPEN_CODE_INSTALL_DEFINITION,
  test(context) {
    return context.runCheck(createOpenCodeHealthCheck());
  },
  spawn(context, options) {
    const opts = (options ?? {}) as {
      prompt: string;
      args?: string[];
      model?: string;
    };
    const args = [
      ...getModelArgs(opts.model),
      "run",
      opts.prompt,
      ...(opts.args ?? [])
    ];
    return context.command.runCommand("opencode", args);
  }
});
