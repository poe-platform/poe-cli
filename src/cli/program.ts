import { Command } from "commander";
import path from "node:path";
import type { FileSystem } from "../utils/file-system.js";
import { initProject } from "../commands/init.js";
import {
  configureClaudeCode,
  removeClaudeCode
} from "../services/claude-code.js";
import { configureCodex, removeCodex } from "../services/codex.js";
import {
  DryRunRecorder,
  createDryRunFileSystem,
  formatDryRunOperations
} from "../utils/dry-run.js";

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
  exitOverride?: boolean;
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
  const {
    fs: baseFs,
    prompts,
    env,
    logger = console.log,
    exitOverride = true
  } = dependencies;

  const program = new Command();
  program
    .name("poe-cli")
    .description("CLI tool to configure Poe API for various development tools.");
  program.option("--dry-run", "Simulate commands without writing changes.");

  if (exitOverride) {
    program.exitOverride();
  }

  program
    .command("init")
    .description("Initialize a Python project preconfigured for Poe API.")
    .option("--project-name <name>", "Project directory name")
    .option("--api-key <key>", "Poe API key")
    .option("--model <model>", "Model identifier")
    .action(async (options: InitCommandOptions) => {
      const isDryRun = Boolean(program.optsWithGlobals().dryRun);
      const context = createCommandContext({
        baseFs,
        isDryRun,
        logger
      });
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
        fs: context.fs,
        cwd: env.cwd,
        projectName,
        apiKey,
        model
      });
      context.complete({
        success: `Initialized project "${projectName}".`,
        dry: `Dry run: would initialize project "${projectName}".`
      });
    });

  program
    .command("configure")
    .description("Configure developer tooling for Poe API.")
    .argument("<service>", "Service to configure (claude-code | codex)")
    .option("--api-key <key>", "Poe API key")
    .option("--model <model>", "Model identifier")
    .option("--reasoning-effort <level>", "Reasoning effort level")
    .action(async (service: string, options: ConfigureCommandOptions) => {
      const isDryRun = Boolean(program.optsWithGlobals().dryRun);
      const context = createCommandContext({
        baseFs,
        isDryRun,
        logger
      });
      if (service === "claude-code") {
        const apiKey = await ensureOption(
          options.apiKey,
          prompts,
          "apiKey",
          "POE API key"
        );
        const bashrcPath = path.join(env.homeDir, ".bashrc");
        await configureClaudeCode({ fs: context.fs, bashrcPath, apiKey });
        context.complete({
          success: "Configured Claude Code.",
          dry: "Dry run: would configure Claude Code."
        });
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
          fs: context.fs,
          configPath,
          model,
          reasoningEffort
        });
        context.complete({
          success: "Configured Codex.",
          dry: "Dry run: would configure Codex."
        });
        return;
      }

      throw new Error(`Unknown service "${service}".`);
    });

  program
    .command("remove")
    .description("Remove existing Poe API tooling configuration.")
    .argument("<service>", "Service to remove (claude-code | codex)")
    .action(async (service: string) => {
      const isDryRun = Boolean(program.optsWithGlobals().dryRun);
      const context = createCommandContext({
        baseFs,
        isDryRun,
        logger
      });
      if (service === "claude-code") {
        const bashrcPath = path.join(env.homeDir, ".bashrc");
        const removed = await removeClaudeCode({ fs: context.fs, bashrcPath });
        context.complete({
          success: removed
            ? "Removed Claude Code configuration."
            : "No Claude Code configuration found.",
          dry: "Dry run: would remove Claude Code configuration."
        });
        return;
      }

      if (service === "codex") {
        const configPath = path.join(env.homeDir, ".codex", "config.toml");
        const removed = await removeCodex({ fs: context.fs, configPath });
        context.complete({
          success: removed
            ? "Removed Codex configuration."
            : "No Codex configuration found.",
          dry: "Dry run: would remove Codex configuration."
        });
        return;
      }

      throw new Error(`Unknown service "${service}".`);
    });

  return program;
}

interface CommandContextInit {
  baseFs: FileSystem;
  isDryRun: boolean;
  logger: LoggerFn;
}

interface CommandContext {
  fs: FileSystem;
  complete(messages: { success: string; dry: string }): void;
}

function createCommandContext(init: CommandContextInit): CommandContext {
  if (!init.isDryRun) {
    return {
      fs: init.baseFs,
      complete(messages) {
        init.logger(messages.success);
      }
    };
  }

  const recorder = new DryRunRecorder();
  const dryFs = createDryRunFileSystem(init.baseFs, recorder);

  return {
    fs: dryFs,
    complete(messages) {
      init.logger(messages.dry);
      for (const line of formatDryRunOperations(recorder.drain())) {
        init.logger(line);
      }
    }
  };
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
