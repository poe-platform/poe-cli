import type { CliEnvironment } from "../cli/environment.js";
import type { PrerequisiteDefinition } from "../utils/prerequisites.js";
import {
  createBinaryExistsCheck,
  runAndMatchOutput
} from "../utils/prerequisites.js";
import { isTomlTable, type TomlTable } from "../utils/toml.js";
import { type ServiceInstallDefinition } from "../services/service-install.js";
import {
  createBackupMutation,
  ensureDirectory,
  tomlTemplateMergeMutation,
  tomlPruneMutation
} from "../services/service-manifest.js";
import { createProvider } from "./create-provider.js";
import { createBinaryVersionResolver } from "./versioned-provider.js";

type CodexConfigureContext = {
  env: CliEnvironment;
  apiKey: string;
  model: string;
  reasoningEffort: string;
  timestamp?: () => string;
};

type CodexRemoveContext = {
  env: CliEnvironment;
};

const CODEX_PROVIDER_ID = "poe";
const CODEX_BASE_URL = "https://api.poe.com/v1";
const CODEX_TOP_LEVEL_FIELDS = [
  "model",
  "model_reasoning_effort"
] as const;
export const CODEX_INSTALL_DEFINITION: ServiceInstallDefinition = {
  id: "codex",
  summary: "Codex CLI",
  check: createBinaryExistsCheck(
    "codex",
    "codex-cli-binary",
    "Codex CLI binary must exist"
  ),
  steps: [
    {
      id: "install-codex-cli-npm",
      description: "Install Codex CLI via npm",
      command: "npm",
      args: ["install", "-g", "@openai/codex"]
    }
  ],
  postChecks: [createCodexVersionCheck()],
  successMessage: "Installed Codex CLI via npm."
};

function stripCodexConfiguration(
  document: TomlTable
): { changed: boolean; empty: boolean } {
  if (!isTomlTable(document)) {
    return { changed: false, empty: false };
  }

  if (document["model_provider"] !== CODEX_PROVIDER_ID) {
    return { changed: false, empty: false };
  }

  const providers = document["model_providers"];
  if (!isTomlTable(providers)) {
    return { changed: false, empty: false };
  }

  const poeConfig = providers[CODEX_PROVIDER_ID];
  if (!isTomlTable(poeConfig) || !matchesExpectedProviderConfig(poeConfig)) {
    return { changed: false, empty: false };
  }

  for (const field of CODEX_TOP_LEVEL_FIELDS) {
    if (typeof document[field] !== "string") {
      return { changed: false, empty: false };
    }
  }

  delete document["model_provider"];

  for (const field of CODEX_TOP_LEVEL_FIELDS) {
    delete document[field];
  }

  delete providers[CODEX_PROVIDER_ID];

  if (isTableEmpty(providers)) {
    delete document["model_providers"];
  }

  return {
    changed: true,
    empty: isTableEmpty(document)
  };
}

function matchesExpectedProviderConfig(table: TomlTable): boolean {
  if (table["name"] !== "poe") {
    return false;
  }
  if (table["base_url"] !== CODEX_BASE_URL) {
    return false;
  }
  if (table["wire_api"] !== "chat") {
    return false;
  }

  const envKey = table["env_key"];
  if (
    envKey != null &&
    envKey !== "OPENAI_API_KEY" &&
    envKey !== "POE_API_KEY"
  ) {
    return false;
  }

  const bearer = table["experimental_bearer_token"];
  if (bearer != null && typeof bearer !== "string") {
    return false;
  }

  return true;
}

function isTableEmpty(value: unknown): value is TomlTable {
  return isTomlTable(value) && Object.keys(value).length === 0;
}

const CODEX_DEFAULT_EXEC_ARGS = ["--full-auto"] as const;

export function buildCodexExecArgs(
  prompt: string,
  extraArgs: string[] = []
): string[] {
  return ["exec", prompt, ...CODEX_DEFAULT_EXEC_ARGS, ...extraArgs];
}

function createCodexVersionCheck(): PrerequisiteDefinition {
  return {
    id: "codex-cli-version",
    description: "Codex CLI responds to --version",
    async run({ runCommand }) {
      const result = await runCommand("codex", ["--version"]);
      if (result.exitCode !== 0) {
        throw new Error(
          `Codex CLI --version failed with exit code ${result.exitCode}.`
        );
      }
    }
  };
}

function createCodexCliHealthCheck(): PrerequisiteDefinition {
  return {
    id: "codex-cli-health",
    description: "Codex CLI health check must succeed",
    async run(context) {
      await runAndMatchOutput(context, {
        command: "codex",
        args: buildCodexExecArgs("Output exactly: CODEX_OK"),
        expectedOutput: "CODEX_OK",
        label: "Codex CLI health check"
      });
    }
  };
}

export const codexService = createProvider<
  Record<string, never>,
  CodexConfigureContext,
  CodexRemoveContext,
  { prompt: string; args?: string[] }
>({
  name: "codex",
  label: "Codex",
  id: "codex",
  summary: "Configure Codex to use Poe as the model provider.",
  branding: {
    colors: {
      dark: "#D5D9DF",
      light: "#7A7F86"
    }
  },
  hooks: {
    after: [createCodexCliHealthCheck()]
  },
  manifest: {
    "*": {
      configure: [
        ensureDirectory({ path: "~/.codex" }),
        createBackupMutation({
          target: "~/.codex/config.toml",
          timestamp: ({ options }) => options.timestamp
        }),
        tomlTemplateMergeMutation({
          target: "~/.codex/config.toml",
          templateId: "codex/config.toml.hbs",
          context: ({ options }) => ({
            apiKey: options.apiKey,
            model: options.model,
            reasoningEffort: options.reasoningEffort
          })
        })
      ],
      remove: [
        tomlPruneMutation({
          target: "~/.codex/config.toml",
          prune: (document) => {
            const result = stripCodexConfiguration(document);
            if (!result.changed) {
              return { changed: false, result: document };
            }
            return {
              changed: true,
              result: result.empty ? null : document
            };
          }
        })
      ]
    }
  },
  versionResolver: createBinaryVersionResolver("codex"),
  install: CODEX_INSTALL_DEFINITION,
  spawn(context, options) {
    const args = buildCodexExecArgs(options.prompt, options.args);
    return context.command.runCommand("codex", args);
  }
});
