import path from "node:path";
import type { ProviderService } from "../cli/service-registry.js";
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
  CLAUDE_MODEL_OPUS,
  CLAUDE_MODEL_SONNET,
  CLAUDE_MODEL_HAIKU
} from "../cli/constants.js";
import { deepMergeJson, pruneJsonByShape } from "../utils/json.js";
import { renderTemplate } from "../utils/templates.js";
import {
  makeExecutable,
  quoteSinglePath,
  readJsonFile,
  removeFileIfExists,
  writeJsonFile
} from "./provider-helpers.js";

export interface ClaudeCodePaths extends Record<string, string> {
  settingsPath: string;
  keyHelperPath: string;
  credentialsPath: string;
}

export type ClaudeCodeConfigureOptions = {
  apiKey: string;
  settingsPath: string;
  keyHelperPath: string;
  credentialsPath: string;
  defaultModel: string;
};

export type ClaudeCodeRemoveOptions = {
  settingsPath: string;
  keyHelperPath: string;
};

const KEY_HELPER_TEMPLATE_ID = "claude-code/anthropic_key.sh.hbs";
const KEY_HELPER_MODE = 0o700;
const CLAUDE_ENV_SHAPE = {
  apiKeyHelper: true,
  env: {
    ANTHROPIC_BASE_URL: true,
    ANTHROPIC_DEFAULT_HAIKU_MODEL: true,
    ANTHROPIC_DEFAULT_SONNET_MODEL: true,
    ANTHROPIC_DEFAULT_OPUS_MODEL: true
  },
  model: true
} as const;

export const CLAUDE_CODE_INSTALL_DEFINITION: ServiceInstallDefinition = {
  id: "claude-code",
  summary: "Claude CLI",
  check: createBinaryExistsCheck(
    "claude",
    "claude-cli-binary",
    "Claude CLI binary must exist"
  ),
  steps: [
    {
      id: "install-claude-cli-npm",
      description: "Install Claude CLI via npm",
      command: "npm",
      args: ["install", "-g", "@anthropic-ai/claude-code"]
    }
  ],
  successMessage: "Installed Claude CLI via npm."
};

const CLAUDE_SPAWN_DEFAULTS = [
  "--allowedTools",
  "Bash,Read",
  "--permission-mode",
  "acceptEdits",
  "--output-format",
  "text"
] as const;

function buildClaudeArgs(prompt: string, extraArgs?: string[]): string[] {
  return ["-p", prompt, ...CLAUDE_SPAWN_DEFAULTS, ...(extraArgs ?? [])];
}

function createClaudeCliHealthCheck(): PrerequisiteDefinition {
  return {
    id: "claude-cli-health",
    description: "Claude CLI health check must succeed",
    async run({ runCommand }) {
      const args = buildClaudeArgs("Output exactly: CLAUDE_CODE_OK");
      const result = await runCommand("claude", args);
      if (result.exitCode !== 0) {
        const detail = formatCommandRunnerResult(result);
        throw new Error(
          [
            `Claude CLI health check failed with exit code ${result.exitCode}.`,
            detail
          ].join("\n")
        );
      }
      const output = result.stdout.trim();
      if (output !== "CLAUDE_CODE_OK") {
        const detail = formatCommandRunnerResult(result);
        throw new Error(
          [
            `Claude CLI health check failed: expected "CLAUDE_CODE_OK" but received "${output}".`,
            detail
          ].join("\n")
        );
      }
    }
  };
}

export const claudeCodeService: ProviderService<
  ClaudeCodePaths,
  ClaudeCodeConfigureOptions,
  ClaudeCodeRemoveOptions,
  { prompt: string; args?: string[] }
> = {
  id: "claude-code",
  summary: "Configure Claude Code to route through Poe.",
  prerequisites: {
    after: ["claude-cli-health"]
  },
  async configure(context) {
    const { fs, options } = context;
    await fs.mkdir(path.dirname(options.settingsPath), { recursive: true });
    await fs.mkdir(path.dirname(options.keyHelperPath), { recursive: true });

    const helperScript = await renderTemplate(KEY_HELPER_TEMPLATE_ID, {
      credentialsPathLiteral: quoteSinglePath(options.credentialsPath)
    });
    await fs.writeFile(options.keyHelperPath, helperScript, {
      encoding: "utf8"
    });
    await makeExecutable(fs, options.keyHelperPath, KEY_HELPER_MODE);

    const { data, raw } = await readJsonFile(fs, options.settingsPath);
    const merged = deepMergeJson(data, {
      apiKeyHelper: options.keyHelperPath,
      env: {
        ANTHROPIC_BASE_URL: "https://api.poe.com",
        ANTHROPIC_DEFAULT_HAIKU_MODEL: CLAUDE_MODEL_HAIKU,
        ANTHROPIC_DEFAULT_SONNET_MODEL: CLAUDE_MODEL_SONNET,
        ANTHROPIC_DEFAULT_OPUS_MODEL: CLAUDE_MODEL_OPUS
      },
      model: options.defaultModel
    });
    await writeJsonFile(fs, options.settingsPath, merged, raw);
  },
  async remove(context) {
    const { fs, options } = context;
    let changed = false;
    const { data, raw } = await readJsonFile(fs, options.settingsPath);
    const pruned = pruneJsonByShape(data, CLAUDE_ENV_SHAPE);
    if (pruned.changed) {
      changed = true;
      if (Object.keys(pruned.result).length === 0) {
        await removeFileIfExists(fs, options.settingsPath);
      } else {
        await writeJsonFile(fs, options.settingsPath, pruned.result, raw);
      }
    }
    const removedScript = await removeFileIfExists(fs, options.keyHelperPath);
    return changed || removedScript;
  },
  name: "claude-code",
  label: "Claude Code",
  branding: {
    colors: {
      dark: "#C15F3C",
      light: "#C15F3C"
    }
  },
  resolvePaths(env) {
    return {
      settingsPath: env.resolveHomePath(".claude", "settings.json"),
      keyHelperPath: env.resolveHomePath(".claude", "anthropic_key.sh"),
      credentialsPath: env.credentialsPath
    };
  },
  registerPrerequisites(manager) {
    manager.registerAfter(createClaudeCliHealthCheck());
  },
  async install(context) {
    await runServiceInstall(CLAUDE_CODE_INSTALL_DEFINITION, {
      isDryRun: context.logger.context.dryRun,
      runCommand: context.command.runCommand,
      logger: (message) => context.logger.info(message)
    });
  },
  async spawn(context, options) {
    const args = buildClaudeArgs(options.prompt, options.args);
    return context.command.runCommand("claude", args);
  }
};
