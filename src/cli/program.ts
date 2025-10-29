import { Command } from "commander";
import { spawn } from "node:child_process";
import path from "node:path";
import type { FileSystem } from "../utils/file-system.js";
import { initProject } from "../commands/init.js";
import {
  configureClaudeCode,
  registerClaudeCodePrerequisites,
  removeClaudeCode
} from "../services/claude-code.js";
import { configureCodex, removeCodex } from "../services/codex.js";
import { configureOpenCode, removeOpenCode } from "../services/opencode.js";
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
import {
  createPrerequisiteManager,
  type CommandRunner,
  type CommandRunnerResult,
  type PrerequisiteManager,
  type PrerequisitePhase,
  type PrerequisiteRunHooks
} from "../utils/prerequisites.js";
import {
  type MutationEffect,
  type MutationLogDetails,
  type ServiceMutationHooks,
  type ServiceMutationOutcome
} from "../services/service-manifest.js";
import chalk from "chalk";

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
  commandRunner?: CommandRunner;
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
  model?: string;
}

const DEFAULT_MODEL = "gpt-5";
const DEFAULT_REASONING = "medium";
const DEFAULT_QUERY_MODEL = "Claude-Sonnet-4.5";
const SERVICE_LABELS = {
  "claude-code": "Claude Code",
  codex: "Codex",
  opencode: "OpenCode CLI"
} as const;

export function createProgram(dependencies: CliDependencies): Command {
  const {
    fs: baseFs,
    prompts,
    env,
    logger = console.log,
    exitOverride = true,
    httpClient: providedHttpClient,
    commandRunner: providedCommandRunner
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

  const commandRunner: CommandRunner =
    providedCommandRunner ?? createDefaultCommandRunner();

  const program = new Command();
  program
    .name("poe-setup")
    .description("CLI tool to configure Poe API for various development tools.");
  program.option("--dry-run", "Simulate commands without writing changes.");
  program.option("--verbose", "Enable verbose logging.");

  const credentialsPath = path.join(
    env.homeDir,
    ".poe-setup",
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

  async function configureService(
    service: string,
    options: ConfigureCommandOptions
  ): Promise<void> {
    const opts = program.optsWithGlobals();
    const isDryRun = Boolean(opts.dryRun);
    const isVerbose = Boolean(opts.verbose);
    const commandRunnerForContext = isVerbose
      ? createLoggingCommandRunner(commandRunner, logger)
      : commandRunner;
    const context = createCommandContext({
      baseFs,
      isDryRun,
      logger,
      runCommand: commandRunnerForContext
    });
    const mutationHooks = createMutationLogger(logger, {
      verbose: isVerbose,
      collector: !isVerbose ? context.recordMutation : undefined
    });
    const { prerequisites } = context;

    if (service === "claude-code") {
      registerClaudeCodePrerequisites(prerequisites);
      const beforeHooks = createPrerequisiteHooks("before", logger, isVerbose);
      if (beforeHooks) {
        await prerequisites.run("before", beforeHooks);
      } else {
        await prerequisites.run("before");
      }
      const apiKey = await resolveApiKey(options.apiKey, { isDryRun });
      const settingsPath = path.join(env.homeDir, ".claude", "settings.json");
      await configureClaudeCode(
        {
          fs: context.fs,
          apiKey,
          settingsPath
        },
        mutationHooks ? { hooks: mutationHooks } : undefined
      );
      const afterHooks = createPrerequisiteHooks("after", logger, isVerbose);
      if (afterHooks) {
        await prerequisites.run("after", afterHooks);
      } else {
        await prerequisites.run("after");
      }
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
      await configureCodex(
        {
          fs: context.fs,
          configPath,
          model,
          reasoningEffort
        },
        mutationHooks ? { hooks: mutationHooks } : undefined
      );
      context.complete({
        success: "Configured Codex.",
        dry: "Dry run: would configure Codex."
      });
      return;
    }

    if (service === "opencode") {
      const apiKey = await resolveApiKey(options.apiKey, { isDryRun });
      const configPath = path.join(
        env.homeDir,
        ".config",
        "opencode",
        "config.json"
      );
      const authPath = path.join(
        env.homeDir,
        ".local",
        "share",
        "opencode",
        "auth.json"
      );
      await configureOpenCode(
        {
          fs: context.fs,
          apiKey,
          configPath,
          authPath
        },
        mutationHooks ? { hooks: mutationHooks } : undefined
      );
      context.complete({
        success: "Configured OpenCode CLI.",
        dry: "Dry run: would configure OpenCode CLI."
      });
      return;
    }

    throw new Error(`Unknown service "${service}".`);
  }

  program.action(async () => {
    const serviceIds = Object.keys(SERVICE_LABELS);
    if (serviceIds.length === 0) {
      logger("No services available to configure.");
      return;
    }

    serviceIds.forEach((serviceId, index) => {
      logger(`${index + 1}) ${serviceId}`);
    });
    logger("Enter number that you want to configure:");

    const response = await prompts({
      type: "number",
      name: "serviceSelection",
      message: "Enter number that you want to configure"
    });

    const rawSelection = response.serviceSelection;
    const normalizedSelection =
      typeof rawSelection === "number"
        ? rawSelection
        : typeof rawSelection === "string"
        ? Number.parseInt(rawSelection, 10)
        : NaN;

    if (!Number.isInteger(normalizedSelection)) {
      throw new Error("Invalid service selection.");
    }

    const selectedIndex = normalizedSelection - 1;
    if (selectedIndex < 0 || selectedIndex >= serviceIds.length) {
      throw new Error("Invalid service selection.");
    }

    await configureService(serviceIds[selectedIndex], {});
  });

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
        logger,
        runCommand: commandRunner
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
    .argument(
      "<service>",
      "Service to configure (claude-code | codex | opencode)"
    )
    .option("--api-key <key>", "Poe API key")
    .option("--model <model>", "Model identifier")
    .option("--reasoning-effort <level>", "Reasoning effort level")
    .action(async (service: string, options: ConfigureCommandOptions) => {
      await configureService(service, options);
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
        logger,
        runCommand: commandRunner
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
        success: `Poe API key stored at ${credentialsPath}.`,
        dry: `Dry run: would store Poe API key at ${credentialsPath}.`
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
        logger,
        runCommand: commandRunner
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
    .argument("<text>", "Prompt text to send")
    .option("--model <model>", "Model identifier", DEFAULT_QUERY_MODEL)
    .option("--api-key <key>", "Poe API key")
    .action(async (text: string, options: QueryCommandOptions) => {
      const isDryRun = Boolean(program.optsWithGlobals().dryRun);
      const model = options.model ?? DEFAULT_QUERY_MODEL;
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
      logger(`${model}: ${content}`);
    });

  program
    .command("prerequisites")
    .description("Run prerequisite checks for a service.")
    .argument(
      "<service>",
      "Service to check (claude-code | codex | opencode)"
    )
    .argument("<phase>", "Phase to execute (before | after)")
    .action(async (service: string, phase: string) => {
      const normalizedPhase = normalizePhase(phase);
      const descriptor = SERVICE_LABELS[service as keyof typeof SERVICE_LABELS];
      if (!descriptor) {
        throw new Error(`Unknown service "${service}".`);
      }

      const opts = program.optsWithGlobals();
      const isDryRun = Boolean(opts.dryRun);
      const isVerbose = Boolean(opts.verbose);
      const runnerForContext = isVerbose
        ? createLoggingCommandRunner(commandRunner, logger)
        : commandRunner;
      const context = createCommandContext({
        baseFs,
        isDryRun,
        logger,
        runCommand: runnerForContext
      });

      if (service === "claude-code") {
        registerClaudeCodePrerequisites(context.prerequisites);
      }

      const hooks = createPrerequisiteHooks(
        normalizedPhase,
        logger,
        isVerbose
      );
      if (hooks) {
        await context.prerequisites.run(normalizedPhase, hooks);
      } else {
        await context.prerequisites.run(normalizedPhase);
      }
      context.complete({
        success: `${descriptor} ${normalizedPhase} prerequisites succeeded.`,
        dry: `Dry run: would run ${descriptor} ${normalizedPhase} prerequisites.`
      });
    });

  program
    .command("remove")
    .description("Remove existing Poe API tooling configuration.")
    .argument(
      "<service>",
      "Service to remove (claude-code | codex | opencode)"
    )
    .action(async (service: string) => {
      const opts = program.optsWithGlobals();
      const isDryRun = Boolean(opts.dryRun);
      const isVerbose = Boolean(opts.verbose);
      const commandRunnerForContext = isVerbose
        ? createLoggingCommandRunner(commandRunner, logger)
        : commandRunner;
      const context = createCommandContext({
        baseFs,
        isDryRun,
        logger,
        runCommand: commandRunnerForContext
      });
      const mutationHooks = createMutationLogger(logger, {
        verbose: isVerbose,
        collector: !isVerbose ? context.recordMutation : undefined
      });
      if (service === "claude-code") {
        const settingsPath = path.join(env.homeDir, ".claude", "settings.json");
        const removed = await removeClaudeCode(
          {
            fs: context.fs,
            settingsPath
          },
          mutationHooks ? { hooks: mutationHooks } : undefined
        );
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
        const removed = await removeCodex(
          { fs: context.fs, configPath },
          mutationHooks ? { hooks: mutationHooks } : undefined
        );
        context.complete({
          success: removed
            ? "Removed Codex configuration."
            : "No Codex configuration found.",
          dry: "Dry run: would remove Codex configuration."
        });
        return;
      }

      if (service === "opencode") {
        const configPath = path.join(
          env.homeDir,
          ".config",
          "opencode",
          "config.json"
        );
        const authPath = path.join(
          env.homeDir,
          ".local",
          "share",
          "opencode",
          "auth.json"
        );
        const removed = await removeOpenCode(
          {
            fs: context.fs,
            configPath,
            authPath
          },
          mutationHooks ? { hooks: mutationHooks } : undefined
        );
        context.complete({
          success: removed
            ? "Removed OpenCode CLI configuration."
            : "No OpenCode CLI configuration found.",
          dry: "Dry run: would remove OpenCode CLI configuration."
        });
        return;
      }

      throw new Error(`Unknown service "${service}".`);
    });

  program
    .command("interactive")
    .alias("i")
    .description("Launch interactive mode with a visual CLI interface.")
    .action(async () => {
      logger("Launching interactive mode...");
      const { launchInteractiveMode } = await import("./interactive-launcher.js");
      await launchInteractiveMode(dependencies);
    });

  return program;
}

interface CommandContextInit {
  baseFs: FileSystem;
  isDryRun: boolean;
  logger: LoggerFn;
  runCommand: CommandRunner;
}

interface CommandContext {
  fs: FileSystem;
  prerequisites: PrerequisiteManager;
  recordMutation?: (message: string) => void;
  complete(messages: { success: string; dry: string }): void;
}

function createCommandContext(init: CommandContextInit): CommandContext {
  const prerequisites = createPrerequisiteManager({
    isDryRun: init.isDryRun,
    runCommand: init.runCommand
  });

  if (!init.isDryRun) {
    return {
      fs: init.baseFs,
      prerequisites,
      complete(messages) {
        init.logger(messages.success);
      }
    };
  }

  const recorder = new DryRunRecorder();
  const dryFs = createDryRunFileSystem(init.baseFs, recorder);
  const mutationLogs: string[] = [];

  const recordMutation = (message: string) => {
    mutationLogs.push(message);
  };

  return {
    fs: dryFs,
    prerequisites,
    recordMutation,
    complete(messages) {
      init.logger(messages.dry);
      for (const note of mutationLogs) {
        init.logger(note);
      }
      const recorded = new Set(mutationLogs);
      for (const line of formatDryRunOperations(recorder.drain())) {
        if (!recorded.has(line)) {
          init.logger(line);
        }
      }
    }
  };
}

function normalizePhase(value: string): PrerequisitePhase {
  const normalized = value.toLowerCase();
  if (normalized === "before" || normalized === "after") {
    return normalized;
  }
  throw new Error(`Unknown phase "${value}". Use "before" or "after".`);
}

function createLoggingCommandRunner(
  baseRunner: CommandRunner,
  logger: LoggerFn
): CommandRunner {
  return async (command, args) => {
    const rendered = [command, ...args].join(" ").trim();
    logger(`> ${rendered}`);
    return baseRunner(command, args);
  };
}

function createPrerequisiteHooks(
  phase: PrerequisitePhase,
  logger: LoggerFn,
  verbose: boolean
): PrerequisiteRunHooks | undefined {
  if (!verbose) {
    return undefined;
  }
  return {
    onStart(prerequisite) {
      logger(`Running ${phase} prerequisite: ${prerequisite.description}`);
    },
    onSuccess(prerequisite) {
      logger(`✓ ${prerequisite.description}`);
    },
    onFailure(prerequisite, error) {
      logger(
        `✖ ${prerequisite.description}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  };
}

function createMutationLogger(
  logger: LoggerFn,
  options: { verbose: boolean; collector?: (message: string) => void }
): ServiceMutationHooks | undefined {
  const { verbose, collector } = options;
  if (!verbose && !collector) {
    return undefined;
  }

  const emit = (message: string) => {
    if (collector) {
      collector(message);
    }
    if (verbose) {
      logger(message);
    }
  };

  return {
    onStart() {
      // only log on completion/error
    },
    onComplete(details, outcome) {
      const message = renderMutationMessage(details, outcome);
      emit(message);
    },
    onError(details, error) {
      const errorMessage = renderMutationError(details, error);
      logger(errorMessage);
      collector?.(errorMessage);
    }
  };
}

function renderMutationMessage(
  details: MutationLogDetails,
  outcome: ServiceMutationOutcome
): string {
  const base = formatMutationCommand(details, outcome);
  return decorateMutationCommand(base, outcome);
}

function renderMutationError(details: MutationLogDetails, error: unknown): string {
  const base = formatMutationCommand(details);
  const info = error instanceof Error ? error.message : String(error);
  return chalk.red(`${base} ! ${info}`);
}

function formatMutationCommand(
  details: MutationLogDetails,
  outcome?: ServiceMutationOutcome
): string {
  const target = details.targetPath;
  const effect = outcome?.effect;
  switch (effect) {
    case "mkdir":
      return target ? `mkdir -p ${target}` : "mkdir -p";
    case "copy":
      return target ? `cp ${target} ${target}.bak` : "cp <target> <target>.bak";
    case "write":
      return target ? `cat > ${target}` : "cat > <target>";
    case "delete":
      return target ? `rm ${target}` : "rm <target>";
    case "none":
    default:
      break;
  }
  switch (details.kind) {
    case "ensureDirectory":
      return target ? `mkdir -p ${target}` : "mkdir -p";
    case "createBackup":
      return target ? `cp ${target} ${target}.bak` : "cp <target> <target>.bak";
    case "removeFile":
      return target ? `rm ${target}` : "rm <target>";
    case "writeTemplate":
    case "transformFile":
      return target ? `cat > ${target}` : "cat > <target>";
    default:
      return details.label;
  }
}

function decorateMutationCommand(
  command: string,
  outcome: ServiceMutationOutcome
): string {
  const coloredCommand = colorizeMutation(command, outcome);
  const suffix = describeOutcomeDetail(outcome);
  if (suffix) {
    return `${coloredCommand} ${chalk.dim(suffix)}`;
  }
  return coloredCommand;
}

function colorizeMutation(
  command: string,
  outcome: ServiceMutationOutcome
): string {
  if (!outcome.changed || outcome.effect === "none" || outcome.detail === "noop") {
    return chalk.dim(command);
  }
  switch (outcome.effect) {
    case "mkdir":
      return chalk.cyan(command);
    case "copy":
      return chalk.cyan(command);
    case "write":
      return outcome.detail === "update" ? chalk.yellow(command) : chalk.green(command);
    case "delete":
      return chalk.red(command);
    default:
      return chalk.green(command);
  }
}

function describeOutcomeDetail(outcome: ServiceMutationOutcome): string | null {
  switch (outcome.detail) {
    case "create":
      return "# create";
    case "update":
      return "# update";
    case "delete":
      return "# delete";
    case "backup":
      return "# backup";
    case "noop":
      return "# no change";
    default:
      return outcome.changed ? null : "# no change";
  }
}

function createDefaultCommandRunner(): CommandRunner {
  return async (command, args) =>
    new Promise<CommandRunnerResult>((resolve) => {
      const child = spawn(command, args, {
        stdio: ["ignore", "pipe", "pipe"]
      });
      let stdout = "";
      let stderr = "";

      if (child.stdout) {
        child.stdout.setEncoding("utf8");
        child.stdout.on("data", (data: string | Buffer) => {
          stdout += data.toString();
        });
      }

      if (child.stderr) {
        child.stderr.setEncoding("utf8");
        child.stderr.on("data", (data: string | Buffer) => {
          stderr += data.toString();
        });
      }

      child.on("error", (error: NodeJS.ErrnoException) => {
        const exitCode =
          typeof error.code === "number"
            ? error.code
            : typeof error.errno === "number"
            ? error.errno
            : 127;
        const message = error instanceof Error ? error.message : String(error);
        resolve({
          stdout,
          stderr: stderr ? `${stderr}${message}` : message,
          exitCode
        });
      });

      child.on("close", (code) => {
        resolve({
          stdout,
          stderr,
          exitCode: code ?? 0
        });
      });
    });
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
