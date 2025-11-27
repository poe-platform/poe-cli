import path from "node:path";
import type { ProviderService } from "../cli/service-registry.js";
import type { FileSystem } from "../utils/file-system.js";
import type { PrerequisiteDefinition } from "../utils/prerequisites.js";
import {
  createBinaryExistsCheck,
  formatCommandRunnerResult
} from "../utils/prerequisites.js";
import {
  parseTomlDocument,
  serializeTomlDocument,
  mergeTomlTables,
  isTomlTable,
  type TomlTable
} from "../utils/toml.js";
import {
  runServiceInstall,
  type ServiceInstallDefinition
} from "../services/service-install.js";
import { renderTemplate } from "../utils/templates.js";
import {
  readFileIfExists
} from "./provider-helpers.js";

export interface CodexPaths extends Record<string, string> {
  configPath: string;
}

export type CodexConfigureOptions = {
  configPath: string;
  apiKey: string;
  model: string;
  reasoningEffort: string;
  timestamp?: () => string;
};

export type CodexRemoveOptions = {
  configPath: string;
};

const CODEX_PROVIDER_ID = "poe";
const CODEX_BASE_URL = "https://api.poe.com/v1";
const CODEX_TOP_LEVEL_FIELDS = [
  "model",
  "model_reasoning_effort"
] as const;
const CODEX_CONFIG_TEMPLATE_ID = "codex/config.toml.hbs";

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
    async run({ runCommand }) {
      const result = await runCommand(
        "codex",
        buildCodexExecArgs("Output exactly: CODEX_OK")
      );
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

async function createConfigBackup(
  fs: FileSystem,
  targetPath: string,
  timestamp?: () => string
): Promise<void> {
  const content = await readFileIfExists(fs, targetPath);
  if (content == null) {
    return;
  }
  const stamp = timestamp?.() ?? new Date().toISOString().replaceAll(":", "-");
  const backupPath = `${targetPath}.backup.${stamp}`;
  await fs.writeFile(backupPath, content, { encoding: "utf8" });
}

export const codexService: ProviderService<
  CodexPaths,
  CodexConfigureOptions,
  CodexRemoveOptions,
  { prompt: string; args?: string[] }
> = {
  id: "codex",
  summary: "Configure Codex to use Poe as the model provider.",
  prerequisites: {
    after: ["codex-cli-health"]
  },
  async configure(context) {
    const { fs, options } = context;
    await fs.mkdir(path.dirname(options.configPath), { recursive: true });
    await createConfigBackup(fs, options.configPath, options.timestamp);

    const raw = await readFileIfExists(fs, options.configPath);
    let document: TomlTable = {};
    if (raw != null) {
      try {
        document = parseTomlDocument(raw);
      } catch {
        document = {};
      }
    }

    const rendered = await renderTemplate(CODEX_CONFIG_TEMPLATE_ID, {
      ...options
    });
    const templateDocument = parseTomlDocument(rendered);
    const nextTable = mergeTomlTables(document, templateDocument);
    const serialized = serializeTomlDocument(nextTable);
    if (serialized === (raw ?? "")) {
      return;
    }
    await fs.writeFile(options.configPath, serialized, { encoding: "utf8" });
  },
  async remove(context) {
    const { fs, options } = context;
    const raw = await readFileIfExists(fs, options.configPath);
    if (raw == null) {
      return false;
    }

    let document: TomlTable;
    try {
      document = parseTomlDocument(raw);
    } catch {
      return false;
    }

    const result = stripCodexConfiguration(document);
    if (!result.changed) {
      return false;
    }
    if (result.empty) {
      await fs.unlink(options.configPath);
      return true;
    }

    const serialized = serializeTomlDocument(document);
    if (serialized === raw) {
      return false;
    }
    await fs.writeFile(options.configPath, serialized, { encoding: "utf8" });
    return true;
  },
  name: "codex",
  label: "Codex",
  branding: {
    colors: {
      dark: "#D5D9DF",
      light: "#7A7F86"
    }
  },
  resolvePaths(env) {
    return {
      configPath: env.resolveHomePath(".codex", "config.toml")
    };
  },
  registerPrerequisites(manager) {
    manager.registerAfter(createCodexCliHealthCheck());
  },
  async install(context) {
    await runServiceInstall(CODEX_INSTALL_DEFINITION, {
      isDryRun: context.logger.context.dryRun,
      runCommand: context.command.runCommand,
      logger: (message) => context.logger.info(message)
    });
  },
  async spawn(context, options) {
    const args = buildCodexExecArgs(options.prompt, options.args);
    return context.command.runCommand("codex", args);
  }
};
