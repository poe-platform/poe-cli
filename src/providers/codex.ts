import path from "node:path";
import type { ProviderAdapter } from "../cli/service-registry.js";
import type { ServiceMutationHooks } from "../services/service-manifest.js";
import type { FileSystem } from "../utils/file-system.js";
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
  createBackupMutation,
  ensureDirectory,
  runServiceConfigure,
  runServiceRemove,
  type ServiceManifest,
  type ServiceRunOptions
} from "../services/service-manifest.js";
import {
  parseTomlDocument,
  serializeTomlDocument,
  mergeTomlTables,
  isTomlTable,
  type TomlTable
} from "../utils/toml.js";
import {
  runServiceInstall,
  type InstallContext,
  type ServiceInstallDefinition
} from "../services/service-install.js";
import { renderTemplate } from "../utils/templates.js";

export interface CodexPaths extends Record<string, string> {
  configPath: string;
}

export interface CodexConfigureOptions {
  apiKey: string;
  model: string;
  reasoningEffort: string;
  mutationHooks?: ServiceMutationHooks;
}

export interface CodexRemoveOptions {
  mutationHooks?: ServiceMutationHooks;
}

export interface CodexSpawnOptions {
  prompt: string;
  args: string[];
}

const CODEX_PROVIDER_ID = "poe";
const CODEX_BASE_URL = "https://api.poe.com/v1";
const CODEX_TOP_LEVEL_FIELDS = [
  "model",
  "model_reasoning_effort"
] as const;
const CODEX_CONFIG_TEMPLATE_ID = "codex/config.toml.hbs";

const CODEX_MANIFEST: ServiceManifest<
  ConfigureCodexOptions,
  RemoveCodexOptions
> = {
  id: "codex",
  summary: "Configure Codex to use Poe as the model provider.",
  prerequisites: {
    after: ["codex-cli-health"]
  },
  configure: [
    ensureDirectory({
      path: ({ options }) => path.dirname(options.configPath),
      label: "Ensure Codex config directory"
    }),
    createBackupMutation({
      target: ({ options }) => options.configPath,
      timestamp: ({ options }) => options.timestamp,
      label: "Create Codex config backup"
    }),
    {
      kind: "transformFile",
      target: ({ options }) => options.configPath,
      label: "Merge Codex configuration",
      async transform({ content, context }) {
        let document: TomlTable;
        if (content == null) {
          document = {};
        } else {
          try {
            document = parseTomlDocument(content);
          } catch {
            document = {};
          }
        }
        const rendered = await renderTemplate(
          CODEX_CONFIG_TEMPLATE_ID,
          { ...context.options }
        );
        const templateDocument = parseTomlDocument(rendered);
        const nextTable = mergeTomlTables(document, templateDocument);
        const nextContent = serializeTomlDocument(nextTable);
        return {
          content: nextContent,
          changed: nextContent !== (content ?? "")
        };
      }
    }
  ],
  remove: [
    {
      kind: "transformFile",
      target: ({ options }) => options.configPath,
      label: "Remove Codex managed configuration",
      transform({ content }) {
        if (content == null) {
          return { content: null, changed: false };
        }

        let document: TomlTable;
        try {
          document = parseTomlDocument(content);
        } catch {
          return { content, changed: false };
        }

        const result = stripCodexConfiguration(document);
        if (!result.changed) {
          return { content, changed: false };
        }

        if (result.empty) {
          return { content: null, changed: true };
        }

        const nextContent = serializeTomlDocument(document);
        return {
          content: nextContent,
          changed: nextContent !== content
        };
      }
    }
  ]
};

const CODEX_INSTALL_DEFINITION: ServiceInstallDefinition = {
  id: "codex",
  summary: "Codex CLI",
  check: createCodexBinaryCheck(),
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

export interface ConfigureCodexOptions {
  fs: FileSystem;
  configPath: string;
  apiKey: string;
  model: string;
  reasoningEffort: string;
  timestamp?: () => string;
}

export interface RemoveCodexOptions {
  fs: FileSystem;
  configPath: string;
}

export interface SpawnCodexOptions {
  prompt: string;
  args?: string[];
  runCommand: CommandRunner;
}

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

export async function configureCodex(
  options: ConfigureCodexOptions,
  runOptions?: ServiceRunOptions
): Promise<void> {
  await runServiceConfigure(
    CODEX_MANIFEST,
    {
      fs: options.fs,
      options
    },
    runOptions
  );
}

const CODEX_DEFAULT_EXEC_ARGS = ["--full-auto"] as const;

export function buildCodexExecArgs(
  prompt: string,
  extraArgs: string[] = []
): string[] {
  return ["exec", prompt, ...CODEX_DEFAULT_EXEC_ARGS, ...extraArgs];
}

export async function spawnCodex(
  options: SpawnCodexOptions
): Promise<CommandRunnerResult> {
  const args = buildCodexExecArgs(options.prompt, options.args);
  return options.runCommand("codex", args);
}

export async function removeCodex(
  options: RemoveCodexOptions,
  runOptions?: ServiceRunOptions
): Promise<boolean> {
  return runServiceRemove(
    CODEX_MANIFEST,
    {
      fs: options.fs,
      options
    },
    runOptions
  );
}

export async function installCodex(
  context: InstallContext
): Promise<boolean> {
  return runServiceInstall(CODEX_INSTALL_DEFINITION, context);
}

export function registerCodexPrerequisites(
  prerequisites: PrerequisiteManager
): void {
  prerequisites.registerAfter(createCodexCliHealthCheck());
}

function createCodexBinaryCheck(): PrerequisiteDefinition {
  return createBinaryExistsCheck(
    "codex",
    "codex-cli-binary",
    "Codex CLI binary must exist"
  );
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
    async run({ runCommand }) {
      const result = await spawnCodex({
        prompt: "Output exactly: CODEX_OK",
        runCommand
      });
      if (result.exitCode !== 0) {
        const detail = formatCommandRunnerResult(result);
        throw new Error(
          [
            `Codex CLI health check failed with exit code ${result.exitCode}.`,
            detail
          ].join("\n")
        );
      }
      const output = result.stdout.trim();
      if (output !== "CODEX_OK") {
        const detail = formatCommandRunnerResult(result);
        throw new Error(
          [
            `Codex CLI health check failed: expected "CODEX_OK" but received "${output}".`,
            detail
          ].join("\n")
        );
      }
    }
  };
}

export const codexAdapter: ProviderAdapter<
  CodexPaths,
  CodexConfigureOptions,
  CodexRemoveOptions,
  CodexSpawnOptions
> = {
  name: "codex",
  label: "Codex",
  branding: {
    colors: {
      dark: "#D5D9DF",
      light: "#7A7F86"
    }
  },
  supportsSpawn: true,
  resolvePaths(env) {
    return {
      configPath: env.resolveHomePath(".codex", "config.toml")
    };
  },
  registerPrerequisites(manager) {
    registerCodexPrerequisites(manager);
  },
  async install(context) {
    await installCodex({
      isDryRun: context.logger.context.dryRun,
      runCommand: context.command.runCommand,
      logger: (message) => context.logger.info(message)
    });
  },
  async configure(context, options) {
    await configureCodex(
      {
        fs: context.command.fs,
        configPath: context.paths.configPath,
        apiKey: options.apiKey,
        model: options.model,
        reasoningEffort: options.reasoningEffort
      },
      options.mutationHooks ? { hooks: options.mutationHooks } : undefined
    );
  },
  async remove(context, options) {
    return await removeCodex(
      {
        fs: context.command.fs,
        configPath: context.paths.configPath
      },
      options.mutationHooks ? { hooks: options.mutationHooks } : undefined
    );
  },
  async spawn(context, options) {
    return await spawnCodex({
      prompt: options.prompt,
      args: options.args,
      runCommand: context.command.runCommand
    });
  }
};
