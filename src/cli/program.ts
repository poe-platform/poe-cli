import { Command } from "commander";
import path from "node:path";
import type { FileSystem } from "../utils/file-system";
import { initProject } from "../commands/init";
import {
  configureClaudeCode,
  removeClaudeCode
} from "../services/claude-code";
import { configureCodex, removeCodex } from "../services/codex";

type PromptFn = (questions: unknown) => Promise<Record<string, unknown>>;
type LoggerFn = (message: string) => void;

export interface CliDependencies {
  fs: FileSystem;
  prompts: PromptFn;
  env: {
    cwd: string;
    homeDir: string;
  };
  logger?: LoggerFn;
}

interface InitCommandOptions {
  projectName?: string;
  apiKey?: string;
  model?: string;
}

interface ConfigureCommandOptions {
  apiKey?: string;
  model?: string;
  reasoningEffort?: string;
}

const DEFAULT_MODEL = "gpt-5";
const DEFAULT_REASONING = "medium";

export function createProgram(dependencies: CliDependencies): Command {
  const { fs, prompts, env, logger = console.log } = dependencies;

  const program = new Command();
  program
    .name("poe-setup")
    .description("CLI tool to configure Poe API for various development tools.")
    .exitOverride();

  program
    .command("init")
    .description("Initialize a Python project preconfigured for Poe API.")
    .option("--project-name <name>", "Project directory name")
    .option("--api-key <key>", "Poe API key")
    .option("--model <model>", "Model identifier")
    .action(async (options: InitCommandOptions) => {
      const projectName = await ensureOption(
        options.projectName,
        prompts,
        "projectName",
        "Project name"
      );
      const apiKey = await ensureOption(
        options.apiKey,
        prompts,
        "apiKey",
        "POE API key"
      );
      const model =
        options.model ??
        (await ensureOption(undefined, prompts, "model", "Model", DEFAULT_MODEL));

      await initProject({
        fs,
        cwd: env.cwd,
        projectName,
        apiKey,
        model
      });
      logger(`Initialized project "${projectName}".`);
    });

  program
    .command("configure")
    .description("Configure developer tooling for Poe API.")
    .argument("<service>", "Service to configure (claude-code | codex)")
    .option("--api-key <key>", "Poe API key")
    .option("--model <model>", "Model identifier")
    .option("--reasoning-effort <level>", "Reasoning effort level")
    .action(async (service: string, options: ConfigureCommandOptions) => {
      if (service === "claude-code") {
        const apiKey = await ensureOption(
          options.apiKey,
          prompts,
          "apiKey",
          "POE API key"
        );
        const bashrcPath = path.join(env.homeDir, ".bashrc");
        await configureClaudeCode({ fs, bashrcPath, apiKey });
        logger("Configured Claude Code.");
        return;
      }

      if (service === "codex") {
        const model =
          options.model ??
          (await ensureOption(undefined, prompts, "model", "Model", DEFAULT_MODEL));
        const reasoningEffort =
          options.reasoningEffort ??
          (await ensureOption(
            undefined,
            prompts,
            "reasoningEffort",
            "Reasoning effort",
            DEFAULT_REASONING
          ));
        const configPath = path.join(env.homeDir, ".codex", "config.toml");
        await configureCodex({
          fs,
          configPath,
          model,
          reasoningEffort
        });
        logger("Configured Codex.");
        return;
      }

      throw new Error(`Unknown service "${service}".`);
    });

  program
    .command("remove")
    .description("Remove existing Poe API tooling configuration.")
    .argument("<service>", "Service to remove (claude-code | codex)")
    .action(async (service: string) => {
      if (service === "claude-code") {
        const bashrcPath = path.join(env.homeDir, ".bashrc");
        const removed = await removeClaudeCode({ fs, bashrcPath });
        logger(
          removed
            ? "Removed Claude Code configuration."
            : "No Claude Code configuration found."
        );
        return;
      }

      if (service === "codex") {
        const configPath = path.join(env.homeDir, ".codex", "config.toml");
        const removed = await removeCodex({ fs, configPath });
        logger(
          removed
            ? "Removed Codex configuration."
            : "No Codex configuration found."
        );
        return;
      }

      throw new Error(`Unknown service "${service}".`);
    });

  return program;
}

async function ensureOption(
  value: string | undefined,
  prompts: PromptFn,
  name: string,
  message: string,
  defaultValue?: string
): Promise<string> {
  if (value != null) {
    return value;
  }
  if (defaultValue != null) {
    return defaultValue;
  }

  const response = await prompts({
    type: "text",
    name,
    message
  });

  const result = response[name];
  if (!result || typeof result !== "string") {
    throw new Error(`Missing value for "${name}".`);
  }
  return result;
}
