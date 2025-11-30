import { DEFAULT_KIMI_MODEL, KIMI_MODELS, PROVIDER_NAME } from "../cli/constants.js";
import type { JsonObject } from "../utils/json.js";
import type { CommandCheck } from "../utils/command-checks.js";
import { createBinaryExistsCheck, createCommandExpectationCheck } from "../utils/command-checks.js";
import { type ServiceInstallDefinition } from "../services/service-install.js";
import {
  ensureDirectory,
  jsonMergeMutation,
  jsonPruneMutation
} from "../services/service-manifest.js";
import { createProvider } from "./create-provider.js";
import { createBinaryVersionResolver } from "./versioned-provider.js";

function providerModel(model?: string): string {
  const value = model ?? DEFAULT_KIMI_MODEL;
  const prefix = `${PROVIDER_NAME}/`;
  return value.startsWith(prefix) ? value : `${prefix}${value}`;
}

const KIMI_MODEL_RECORD = KIMI_MODELS.reduce<Record<string, { name: string }>>((acc, id) => {
  acc[id] = { name: id };
  return acc;
}, {});

export const KIMI_INSTALL_DEFINITION: ServiceInstallDefinition = {
  id: "kimi",
  summary: "Kimi CLI",
  check: createBinaryExistsCheck("kimi", "kimi-cli-binary", "Kimi CLI binary must exist"),
  steps: [
    {
      id: "install-kimi-cli-npm",
      command: "npm",
      args: ["install", "-g", "kimi-ai"]
    }
  ],
  postChecks: [createKimiVersionCheck()],
  successMessage: "Installed Kimi CLI via npm."
};

function createKimiVersionCheck(): CommandCheck {
  return {
    id: "kimi-cli-version",
    async run({ runCommand }) {
      const result = await runCommand("kimi", ["--version"]);
      if (result.exitCode !== 0) {
        throw new Error(`Kimi CLI --version failed with exit code ${result.exitCode}.`);
      }
    }
  };
}

function getModelArgs(model?: string): string[] {
  return ["--model", providerModel(model)];
}

export const kimiService = createProvider({
  name: "kimi",
  label: "Kimi CLI",
  id: "kimi",
  summary: "Configure Kimi CLI to use the Poe API.",
  branding: {
    colors: {
      dark: "#00C9A7",
      light: "#00B896"
    }
  },
  configurePrompts: {
    model: {
      label: "Kimi model",
      defaultValue: DEFAULT_KIMI_MODEL,
      choices: KIMI_MODELS.map((id) => ({
        title: id,
        value: id
      }))
    }
  },
  manifest: {
    "*": {
      configure: [
        ensureDirectory({
          path: "~/.config/kimi"
        }),
        ensureDirectory({
          path: "~/.local/share/kimi"
        }),
        jsonMergeMutation({
          target: "~/.config/kimi/config.json",
          value: ({ options }) => {
            const { model } = (options ?? {}) as { model?: string };
            return {
              $schema: "https://kimi.ai/config.json",
              model: providerModel(model),
              provider: {
                [PROVIDER_NAME]: {
                  npm: "@ai-sdk/openai-compatible",
                  name: "poe.com",
                  options: {
                    baseURL: "https://api.poe.com/v1"
                  },
                  models: KIMI_MODEL_RECORD
                }
              }
            };
          }
        }),
        jsonMergeMutation({
          target: "~/.local/share/kimi/auth.json",
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
          target: "~/.config/kimi/config.json",
          shape: (): JsonObject => ({
            provider: {
              [PROVIDER_NAME]: true
            }
          })
        }),
        jsonPruneMutation({
          target: "~/.local/share/kimi/auth.json",
          shape: (): JsonObject => ({
            [PROVIDER_NAME]: true
          })
        })
      ]
    }
  },
  versionResolver: createBinaryVersionResolver("kimi"),
  install: KIMI_INSTALL_DEFINITION,
  test(context) {
    return context.runCheck(
      createCommandExpectationCheck({
        id: "kimi-cli-health",
        command: "kimi",
        args: [...getModelArgs(DEFAULT_KIMI_MODEL), "run", "Output exactly: KIMI_OK"],
        expectedOutput: "KIMI_OK"
      })
    );
  },
  spawn(context, options) {
    const opts = (options ?? {}) as {
      prompt: string;
      args?: string[];
      model?: string;
    };
    const args = [...getModelArgs(opts.model), "run", opts.prompt, ...(opts.args ?? [])];
    return context.command.runCommand("kimi", args);
  }
});
