import path from "node:path";
import type { ProviderService } from "../cli/service-registry.js";
import type { JsonObject } from "../utils/json.js";
import { deepMergeJson, pruneJsonByShape } from "../utils/json.js";
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
  readJsonFile,
  removeFileIfExists,
  writeJsonFile
} from "./provider-helpers.js";

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
  async configure(context) {
    const { fs, options } = context;
    await fs.mkdir(path.dirname(options.configPath), { recursive: true });
    await fs.mkdir(path.dirname(options.authPath), { recursive: true });

    const configDoc = await readJsonFile(fs, options.configPath);
    const mergedConfig = deepMergeJson(
      configDoc.data,
      OPEN_CODE_CONFIG_TEMPLATE
    );
    await writeJsonFile(fs, options.configPath, mergedConfig, configDoc.raw);

    const authDoc = await readJsonFile(fs, options.authPath);
    const nextAuth: JsonObject = {
      ...authDoc.data,
      poe: {
        type: "api",
        key: options.apiKey
      }
    };
    await writeJsonFile(fs, options.authPath, nextAuth, authDoc.raw);
  },
  async remove(context) {
    const { fs, options } = context;
    let changed = false;

    const configDoc = await readJsonFile(fs, options.configPath);
    const prunedConfig = pruneJsonByShape(
      configDoc.data,
      OPEN_CODE_CONFIG_SHAPE
    );
    if (prunedConfig.changed) {
      changed = true;
      if (Object.keys(prunedConfig.result).length === 0) {
        await removeFileIfExists(fs, options.configPath);
      } else {
        await writeJsonFile(fs, options.configPath, prunedConfig.result, configDoc.raw);
      }
    }

    const authDoc = await readJsonFile(fs, options.authPath);
    if ("poe" in authDoc.data) {
      changed = true;
      const nextAuth = { ...authDoc.data };
      delete nextAuth.poe;
      if (Object.keys(nextAuth).length === 0) {
        await removeFileIfExists(fs, options.authPath);
      } else {
        await writeJsonFile(fs, options.authPath, nextAuth, authDoc.raw);
      }
    }

    return changed;
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
