import { Command } from "commander";
import path from "node:path";
import type { FileSystem } from "../utils/file-system.js";
import { initProject } from "../commands/init.js";
import {
  configureClaudeCode,
  removeClaudeCode
} from "../services/claude-code.js";
import { configureCodex, removeCodex } from "../services/codex.js";
import { preparePlaceholderPackage } from "../commands/publish-placeholder.js";
import {
  deleteCredentials,
  loadCredentials,
  saveCredentials
} from "../services/credentials.js";
import {
  DryRunRecorder,
  createDryRunFileSystem,
  formatDryRunOperations
} from "../utils/dry-run.js";

type PromptFn = (questions: unknown) => Promise<Record<string, unknown>>;
type LoggerFn = (message: string) => void;

interface HttpResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

interface HttpClientRequest {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

type HttpClient = (url: string, init?: HttpClientRequest) => Promise<HttpResponse>;

export interface CliDependencies {
  fs: FileSystem;
  prompts: PromptFn;
  env: {
    cwd: string;
    homeDir: string;
  };
  logger?: LoggerFn;
  exitOverride?: boolean;
  httpClient?: HttpClient;
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

interface LoginCommandOptions {
  apiKey?: string;
}

interface TestCommandOptions {
  apiKey?: string;
}

interface QueryCommandOptions {
  apiKey?: string;
}

const DEFAULT_MODEL = "gpt-5";
const DEFAULT_REASONING = "medium";

export function createProgram(dependencies: CliDependencies): Command {
  const {
    fs: baseFs,
    prompts,
    env,
    logger = console.log,
    exitOverride = true,
    httpClient: providedHttpClient
  } = dependencies;

  const httpClient: HttpClient =
    providedHttpClient ??
    (async (url, init) => {
      const response = await globalThis.fetch(url, init);
      return {
        ok: response.ok,
        status: response.status,
        json: () => response.json()
      };
    });

  const program = new Command();
  program
    .name("poe-cli")
    .description("CLI tool to configure Poe API for various development tools.");
  program.option("--dry-run", "Simulate commands without writing changes.");

  const credentialsPath = path.join(
    env.homeDir,
    ".poe-cli",
    "credentials.json"
  );

  const getStoredApiKey = async (): Promise<string | null> =>
    loadCredentials({ fs: baseFs, filePath: credentialsPath });

  const normalizeApiKey = (value: string): string => {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      throw new Error("POE API key cannot be empty.");
    }
    return trimmed;
  };

  const resolveApiKey = async (
    value: string | undefined,
    options: { isDryRun: boolean }
  ): Promise<string> => {
    if (value != null) {
      const apiKey = normalizeApiKey(value);
      await persistApiKey(apiKey, options.isDryRun);
      return apiKey;
    }
    const stored = await getStoredApiKey();
    if (stored) {
      return normalizeApiKey(stored);
    }
    const prompted = await ensureOption(
      undefined,
      prompts,
      "apiKey",
      "POE API key"
    );
    const apiKey = normalizeApiKey(prompted);
    await persistApiKey(apiKey, options.isDryRun);
    return apiKey;
  };

  const persistApiKey = async (
    apiKey: string,
    isDryRun: boolean
  ): Promise<void> => {
    if (isDryRun) {
      return;
    }
    const existing = await getStoredApiKey();
    if (existing === apiKey) {
      return;
    }
    await saveCredentials({
      fs: baseFs,
      filePath: credentialsPath,
      apiKey
    });
  };

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
      const apiKey = await resolveApiKey(options.apiKey, { isDryRun });
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
        const apiKey = await resolveApiKey(options.apiKey, { isDryRun });
        const bashrcPath = path.join(env.homeDir, ".bashrc");
        const settingsPath = path.join(env.homeDir, ".claude", "settings.json");
        await configureClaudeCode({
          fs: context.fs,
          bashrcPath,
          apiKey,
          settingsPath
        });
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
    .command("login")
    .description("Store a Poe API key for reuse across commands.")
    .option("--api-key <key>", "Poe API key")
    .action(async (options: LoginCommandOptions) => {
      const isDryRun = Boolean(program.optsWithGlobals().dryRun);
      const context = createCommandContext({
        baseFs,
        isDryRun,
        logger
      });
      const input =
        options.apiKey ??
        (await ensureOption(undefined, prompts, "apiKey", "POE API key"));
      const apiKey = normalizeApiKey(input);
      await saveCredentials({
        fs: context.fs,
        filePath: credentialsPath,
        apiKey
      });
      context.complete({
        success: "Poe API key stored.",
        dry: "Dry run: would store Poe API key."
      });
    });

  program
    .command("logout")
    .description("Remove the stored Poe API key.")
    .action(async () => {
      const isDryRun = Boolean(program.optsWithGlobals().dryRun);
      const context = createCommandContext({
        baseFs,
        isDryRun,
        logger
      });
      const stored = await getStoredApiKey();
      if (!stored) {
        context.complete({
          success: "No stored Poe API key found.",
          dry: "Dry run: no stored Poe API key to remove."
        });
        return;
      }
      await deleteCredentials({ fs: context.fs, filePath: credentialsPath });
      context.complete({
        success: "Removed stored Poe API key.",
        dry: "Dry run: would remove stored Poe API key."
      });
    });

  program
    .command("test")
    .description('Verify the Poe API key by sending "Ping" to EchoBot.')
    .option("--api-key <key>", "Poe API key")
    .action(async (options: TestCommandOptions) => {
      const isDryRun = Boolean(program.optsWithGlobals().dryRun);
      const apiKey = await resolveApiKey(options.apiKey, { isDryRun });

      if (isDryRun) {
        logger('Dry run: would verify Poe API key by calling EchoBot with "Ping".');
        return;
      }

      await verifyPoeApiKey(httpClient, apiKey);
      logger("Poe API key verified via EchoBot.");
    });

  program
    .command("query")
    .description(
      "Send a prompt to a Poe model via the OpenAI-compatible API and print the response."
    )
    .argument("<model>", "Model identifier")
    .argument("<text>", "Prompt text to send")
    .option("--api-key <key>", "Poe API key")
    .action(async (model: string, text: string, options: QueryCommandOptions) => {
      const isDryRun = Boolean(program.optsWithGlobals().dryRun);
      if (isDryRun) {
        logger(`Dry run: would query "${model}" with text "${text}".`);
        return;
      }

      const apiKey = await resolveApiKey(options.apiKey, { isDryRun });
      const content = await queryPoeModel(httpClient, {
        apiKey,
        model,
        prompt: text
      });
      logger(`Query response: ${content}`);
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

  program
    .command("publish-placeholder")
    .description(
      "Prepare a placeholder package folder to reserve the poe-cli name on npm."
    )
    .option(
      "--output <dir>",
      "Directory (relative to cwd) for the placeholder package.",
      "placeholder-package"
    )
    .action(async (options: { output?: string }) => {
      const isDryRun = Boolean(program.optsWithGlobals().dryRun);
      const context = createCommandContext({
        baseFs,
        isDryRun,
        logger
      });
      const output = options.output ?? "placeholder-package";
      const targetDir = path.isAbsolute(output)
        ? output
        : path.join(env.cwd, output);

      await preparePlaceholderPackage({
        fs: context.fs,
        targetDir,
        packageName: "poe-cli"
      });

      context.complete({
        success: `Placeholder package ready at ${targetDir}. Run "npm publish ${targetDir}" to reserve the name.`,
        dry: `Dry run: would prepare placeholder package at ${targetDir}.`
      });
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

async function verifyPoeApiKey(
  client: HttpClient,
  apiKey: string
): Promise<void> {
  const response = await client("https://api.poe.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: "EchoBot",
      messages: [{ role: "user", content: "Ping" }]
    })
  });

  if (!response.ok) {
    throw new Error(`Poe API test failed (status ${response.status}).`);
  }

  const payload = await response.json();
  const echoed = extractMessageContent(payload);
  if (echoed !== "Ping") {
    throw new Error("Poe API test failed: unexpected response payload.");
  }
}

interface QueryOptions {
  apiKey: string;
  model: string;
  prompt: string;
}

async function queryPoeModel(
  client: HttpClient,
  options: QueryOptions
): Promise<string> {
  const response = await client("https://api.poe.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${options.apiKey}`
    },
    body: JSON.stringify({
      model: options.model,
      messages: [{ role: "user", content: options.prompt }]
    })
  });

  if (!response.ok) {
    throw new Error(`Poe API query failed (status ${response.status}).`);
  }

  const payload = await response.json();
  const content = extractMessageContent(payload);
  if (!content) {
    throw new Error("Poe API query failed: missing response content.");
  }
  return content;
}

function extractMessageContent(payload: unknown): string | null {
  if (
    typeof payload !== "object" ||
    payload === null ||
    !Array.isArray((payload as { choices?: unknown }).choices)
  ) {
    return null;
  }

  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    return null;
  }

  const first = choices[0];
  if (
    typeof first !== "object" ||
    first === null ||
    !("message" in first) ||
    typeof (first as { message?: unknown }).message !== "object" ||
    (first as { message?: unknown }).message === null
  ) {
    return null;
  }

  const message = (first as { message?: { content?: unknown } }).message;
  const content = message?.content;
  return typeof content === "string" ? content : null;
}
