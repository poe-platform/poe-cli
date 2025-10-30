import { Command } from "commander";
import { spawn } from "node:child_process";
import path from "node:path";
import type { FileSystem } from "../utils/file-system.js";
import { initProject } from "../commands/init.js";
import { spawnGitWorktree } from "../commands/spawn-worktree.js";
import {
  configureClaudeCode,
  installClaudeCode,
  registerClaudeCodePrerequisites,
  removeClaudeCode,
  spawnClaudeCode
} from "../services/claude-code.js";
import {
  configureCodex,
  installCodex,
  registerCodexPrerequisites,
  removeCodex,
  spawnCodex
} from "../services/codex.js";
import {
  configureOpenCode,
  installOpenCode,
  registerOpenCodePrerequisites,
  removeOpenCode,
  spawnOpenCode
} from "../services/opencode.js";
import { configureRooCode, removeRooCode } from "../services/roo-code.js";
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
  type MutationLogDetails,
  type ServiceMutationHooks,
  type ServiceMutationOutcome
} from "../services/service-manifest.js";
import { simpleGit as createSimpleGit } from "simple-git";
import chalk from "chalk";
import { createCliEnvironment } from "./environment.js";
import { createServiceRegistry } from "./service-registry.js";
import type { PromptFn, LoggerFn } from "./types.js";

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

interface AgentToolCallEvent {
  toolName: string;
  args: Record<string, unknown>;
  result?: string;
  error?: string;
}

interface AgentSession {
  getModel?(): string;
  setToolCallCallback?(
    callback: (event: AgentToolCallEvent) => void
  ): void;
  sendMessage(prompt: string): Promise<{ content: string }>;
  dispose?(): Promise<void> | void;
}

interface ChatServiceFactoryOptions {
  apiKey: string;
  model: string;
  cwd: string;
  homeDir: string;
  fs: FileSystem;
  logger: LoggerFn;
}

type ChatServiceFactory = (
  options: ChatServiceFactoryOptions
) => Promise<AgentSession> | AgentSession;

export interface CliDependencies {
  fs: FileSystem;
  prompts: PromptFn;
  env: {
    cwd: string;
    homeDir: string;
    platform?: NodeJS.Platform;
    variables?: Record<string, string | undefined>;
  };
  logger?: LoggerFn;
  exitOverride?: boolean;
  httpClient?: HttpClient;
  commandRunner?: CommandRunner;
  chatServiceFactory?: ChatServiceFactory;
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
  configName?: string;
  baseUrl?: string;
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

interface AgentCommandOptions {
  apiKey?: string;
  model?: string;
}

interface SpawnWorktreeCommandOptions {
  branch?: string;
}

interface RemoveCommandOptions {
  configName?: string;
}

const DEFAULT_MODEL = "gpt-5";
const DEFAULT_REASONING = "medium";
const DEFAULT_QUERY_MODEL = "Claude-Sonnet-4.5";
const DEFAULT_ROO_MODEL = "Claude-Sonnet-4.5";
const DEFAULT_ROO_BASE_URL = "https://api.poe.com/v1";
const DEFAULT_ROO_CONFIG_NAME = "poe";
export function createProgram(dependencies: CliDependencies): Command {
  const {
    fs: baseFs,
    prompts,
    env,
    logger = console.log,
    exitOverride = true,
    httpClient: providedHttpClient,
    commandRunner: providedCommandRunner,
    chatServiceFactory: providedChatServiceFactory
  } = dependencies;

  const environment = createCliEnvironment({
    cwd: env.cwd,
    homeDir: env.homeDir,
    platform: env.platform,
    variables: env.variables
  });

  const platform = environment.platform;
  const envVariables = environment.variables;

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

  const chatServiceFactory: ChatServiceFactory =
    providedChatServiceFactory ??
    (async (options) => {
      const { createAgentSession } = (await import(
        "../services/agent-session.js"
      )) as {
        createAgentSession: (
          input: ChatServiceFactoryOptions
        ) => Promise<AgentSession>;
      };
      return createAgentSession(options);
    });

  const serviceRegistry = createServiceRegistry();
  const baseServices = [
    { name: "claude-code", label: "Claude Code", supportsSpawn: true },
    { name: "codex", label: "Codex", supportsSpawn: true },
    { name: "opencode", label: "OpenCode CLI", supportsSpawn: true },
    { name: "roo-code", label: "Roo Code", supportsSpawn: false }
  ] as const;
  for (const service of baseServices) {
    serviceRegistry.register({
      name: service.name,
      label: service.label,
      supportsSpawn: service.supportsSpawn
    });
  }

  const program = new Command();
  program
    .name("poe-setup")
    .description("CLI tool to configure Poe API for various development tools.");
  program.option("--dry-run", "Simulate commands without writing changes.");
  program.option("--verbose", "Enable verbose logging.");

  const credentialsPath = environment.credentialsPath;

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
    const adapter = serviceRegistry.get(service);
    if (!adapter) {
      throw new Error(`Unknown service "${service}".`);
    }
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
      await installClaudeCode({
        isDryRun,
        runCommand: context.runCommand,
        logger
      });
      registerClaudeCodePrerequisites(prerequisites);
      const beforeHooks = createPrerequisiteHooks("before", logger, isVerbose);
      if (beforeHooks) {
        await prerequisites.run("before", beforeHooks);
      } else {
        await prerequisites.run("before");
      }
      const apiKey = await resolveApiKey(options.apiKey, { isDryRun });
      const settingsPath = environment.resolveHomePath(
        ".claude",
        "settings.json"
      );
      const keyHelperPath = environment.resolveHomePath(
        ".claude",
        "anthropic_key.sh"
      );
      await configureClaudeCode(
        {
          fs: context.fs,
          apiKey,
          settingsPath,
          keyHelperPath,
          credentialsPath
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
        dry: "Claude Code (dry run)"
      });
      return;
    }

    if (service === "codex") {
      await installCodex({
        isDryRun,
        runCommand: context.runCommand,
        logger
      });
      const prerequisites = createPrerequisiteManager({
        isDryRun,
        runCommand: context.runCommand
      });
      registerCodexPrerequisites(prerequisites);
      const beforeHooks = createPrerequisiteHooks("before", logger, isVerbose);
      if (beforeHooks) {
        await prerequisites.run("before", beforeHooks);
      } else {
        await prerequisites.run("before");
      }
      const apiKey = await resolveApiKey(options.apiKey, { isDryRun });
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
      const configPath = environment.resolveHomePath(
        ".codex",
        "config.toml"
      );
      await configureCodex(
        {
          fs: context.fs,
          configPath,
          apiKey,
          model,
          reasoningEffort
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
        success: "Configured Codex.",
        dry: "Dry run: would configure Codex."
      });
      return;
    }

    if (service === "opencode") {
      await installOpenCode({
        isDryRun,
        runCommand: context.runCommand,
        logger
      });
      registerOpenCodePrerequisites(prerequisites);
      const beforeHooks = createPrerequisiteHooks("before", logger, isVerbose);
      if (beforeHooks) {
        await prerequisites.run("before", beforeHooks);
      } else {
        await prerequisites.run("before");
      }
      const apiKey = await resolveApiKey(options.apiKey, { isDryRun });
      const configPath = environment.resolveHomePath(
        ".config",
        "opencode",
        "config.json"
      );
      const authPath = environment.resolveHomePath(
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
      const afterHooks = createPrerequisiteHooks("after", logger, isVerbose);
      if (afterHooks) {
        await prerequisites.run("after", afterHooks);
      } else {
        await prerequisites.run("after");
      }
      context.complete({
        success: "Configured OpenCode CLI.",
        dry: "Dry run: would configure OpenCode CLI."
      });
      return;
    }

    if (service === "roo-code") {
      const configName =
        options.configName ??
        (await ensureOption(
          undefined,
          prompts,
          "configName",
          "Roo Code configuration name",
          DEFAULT_ROO_CONFIG_NAME
        ));
      const model =
        options.model ??
        (await ensureOption(
          undefined,
          prompts,
          "model",
          "Model",
          DEFAULT_ROO_MODEL
        ));
      const baseUrl =
        options.baseUrl ??
        (await ensureOption(
          undefined,
          prompts,
          "baseUrl",
          "Base URL",
          DEFAULT_ROO_BASE_URL
        ));
      const apiKey = await resolveApiKey(options.apiKey, { isDryRun });
      const configPath = environment.resolveHomePath(
        "Documents",
        "roo-config.json"
      );
      const settingsPath = resolveVsCodeSettingsPath(
        platform,
        environment.homeDir,
        envVariables
      );
      if (!settingsPath) {
        throw new Error(
          "Unable to determine VSCode settings path for the current platform."
        );
      }
      const autoImportPath = formatAutoImportPath(environment.homeDir, configPath);
      await configureRooCode(
        {
          fs: context.fs,
          configPath,
          settingsPath,
          configName,
          apiKey,
          model,
          baseUrl,
          autoImportPath
        },
        mutationHooks ? { hooks: mutationHooks } : undefined
      );
      context.complete({
        success: "Configured Roo Code.",
        dry: "Dry run: would configure Roo Code."
      });
      return;
    }

    throw new Error(`Service "${service}" does not support configure.`);
  }

  async function spawnService(
    service: string,
    promptText: string,
    agentArgs: string[]
  ): Promise<void> {
    const adapter = serviceRegistry.get(service);
    if (!adapter) {
      throw new Error(`Unknown service "${service}".`);
    }
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

    const descriptor = adapter.label;
    if (!adapter.supportsSpawn) {
      throw new Error(`${descriptor} does not support spawn.`);
    }

    const forwardedArgs = agentArgs ?? [];
    if (isDryRun) {
      const extra =
        forwardedArgs.length > 0 ? ` with args ${JSON.stringify(forwardedArgs)}` : "";
      logger(
        `Dry run: would spawn ${descriptor} with prompt "${promptText}"${extra}.`
      );
      return;
    }

    let result: CommandRunnerResult;
    if (service === "claude-code") {
      result = await spawnClaudeCode({
        prompt: promptText,
        args: forwardedArgs,
        runCommand: context.runCommand
      });
    } else if (service === "codex") {
      result = await spawnCodex({
        prompt: promptText,
        args: forwardedArgs,
        runCommand: context.runCommand
      });
    } else {
      result = await spawnOpenCode({
        prompt: promptText,
        args: forwardedArgs,
        runCommand: context.runCommand
      });
    }

    if (result.exitCode !== 0) {
      const detail = result.stderr.trim() || result.stdout.trim();
      const suffix = detail ? `: ${detail}` : "";
      throw new Error(
        `${descriptor} spawn failed with exit code ${result.exitCode}${suffix}`
      );
    }

    const trimmedStdout = result.stdout.trim();
    if (trimmedStdout) {
      logger(trimmedStdout);
      return;
    }

    const trimmedStderr = result.stderr.trim();
    if (trimmedStderr) {
      logger(trimmedStderr);
      return;
    }

    logger(`${descriptor} spawn completed.`);
  }

  async function runAgentForWorktree(
    service: string,
    promptText: string,
    agentArgs: string[],
    runner: CommandRunner
  ): Promise<CommandRunnerResult> {
    if (service === "claude-code") {
      return await spawnClaudeCode({
        prompt: promptText,
        args: agentArgs,
        runCommand: runner
      });
    }
    if (service === "codex") {
      return await spawnCodex({
        prompt: promptText,
        args: agentArgs,
        runCommand: runner
      });
    }
    return await spawnOpenCode({
      prompt: promptText,
      args: agentArgs,
      runCommand: runner
    });
  }

  program.action(async () => {
    const adapters = serviceRegistry.list();
    if (adapters.length === 0) {
      logger("No services available to configure.");
      return;
    }

    adapters.forEach((entry, index) => {
      logger(`${index + 1}) ${entry.name}`);
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
    if (selectedIndex < 0 || selectedIndex >= adapters.length) {
      throw new Error("Invalid service selection.");
    }

    await configureService(adapters[selectedIndex].name, {});
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
        cwd: environment.cwd,
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
      "Service to configure (claude-code | codex | opencode | roo-code)"
    )
    .option("--api-key <key>", "Poe API key")
    .option("--model <model>", "Model identifier")
    .option("--reasoning-effort <level>", "Reasoning effort level")
    .option("--config-name <name>", "Configuration profile name")
    .option("--base-url <url>", "API base URL")
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
        (await ensureOption(
          undefined,
          prompts,
          "apiKey",
          "Enter your Poe API key (get one at https://poe.com/api_key)",
          undefined,
          { type: "password" }
        ));
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
    .command("agent")
    .description("Run a single Poe agent prompt with local tooling support.")
    .argument("<text>", "Prompt text to send to the agent")
    .option("--model <model>", "Model identifier", DEFAULT_QUERY_MODEL)
    .option("--api-key <key>", "Poe API key")
    .action(async (text: string, options: AgentCommandOptions) => {
      const opts = program.optsWithGlobals();
      const isDryRun = Boolean(opts.dryRun);
      const model = options.model ?? DEFAULT_QUERY_MODEL;
      if (isDryRun) {
        logger(
          `Dry run: would run agent with model "${model}" and prompt "${text}".`
        );
        return;
      }

      const apiKey = await resolveApiKey(options.apiKey, { isDryRun });
      const session = await chatServiceFactory({
        apiKey,
        model,
        cwd: environment.cwd,
        homeDir: environment.homeDir,
        fs: baseFs,
        logger
      });

      try {
        session.setToolCallCallback?.((event) => {
          logToolCallEvent(event, logger);
        });
        const response = await session.sendMessage(text);
        const activeModel = session.getModel ? session.getModel() : model;
        logger(`Agent response (${activeModel}): ${response.content}`);
      } finally {
        await session.dispose?.();
      }
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
      const adapter = serviceRegistry.get(service);
      if (!adapter) {
        throw new Error(`Unknown service "${service}".`);
      }
      const descriptor = adapter.label;

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
      } else if (service === "codex") {
        registerCodexPrerequisites(context.prerequisites);
      } else if (service === "opencode") {
        registerOpenCodePrerequisites(context.prerequisites);
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
      "Service to remove (claude-code | codex | opencode | roo-code)"
    )
    .option("--config-name <name>", "Configuration profile name")
    .action(async (service: string, options: RemoveCommandOptions) => {
      const adapter = serviceRegistry.get(service);
      if (!adapter) {
        throw new Error(`Unknown service "${service}".`);
      }
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
        const settingsPath = environment.resolveHomePath(
          ".claude",
          "settings.json"
        );
        const keyHelperPath = environment.resolveHomePath(
          ".claude",
          "anthropic_key.sh"
        );
        const removed = await removeClaudeCode(
          {
            fs: context.fs,
            settingsPath,
            keyHelperPath
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
        const configPath = environment.resolveHomePath(
          ".codex",
          "config.toml"
        );
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
        const configPath = environment.resolveHomePath(
          ".config",
          "opencode",
          "config.json"
        );
        const authPath = environment.resolveHomePath(
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

      if (service === "roo-code") {
        const configPath = environment.resolveHomePath(
          "Documents",
          "roo-config.json"
        );
        const settingsPath = resolveVsCodeSettingsPath(
          platform,
          environment.homeDir,
          envVariables
        );
        if (!settingsPath) {
          throw new Error(
            "Unable to determine VSCode settings path for the current platform."
          );
        }
        const configName =
          options.configName ??
          (await ensureOption(
            undefined,
            prompts,
            "configName",
            "Roo Code configuration name",
            DEFAULT_ROO_CONFIG_NAME
          ));
        const removed = await removeRooCode(
          {
            fs: context.fs,
            configPath,
            settingsPath,
            configName,
            autoImportPath: formatAutoImportPath(environment.homeDir, configPath)
          },
          mutationHooks ? { hooks: mutationHooks } : undefined
        );
        context.complete({
          success: removed
            ? `Removed Roo Code configuration "${configName}".`
            : `No Roo Code configuration named "${configName}" found.`,
          dry: "Dry run: would remove Roo Code configuration."
        });
        return;
      }

      throw new Error(`Service "${service}" does not support remove.`);
    });

  program
    .command("spawn")
    .description("Run a single prompt through a configured service CLI.")
    .argument(
      "<service>",
      "Service to spawn (claude-code | codex | opencode)"
    )
    .argument("<prompt>", "Prompt text to send")
    .argument("[agentArgs...]", "Additional arguments forwarded to the service CLI")
    .action(
      async (
        service: string,
        promptText: string,
        agentArgs: string[] = []
      ) => {
        await spawnService(service, promptText, agentArgs ?? []);
      }
    );

  program
    .command("spawn-git-worktree")
    .description(
      "Create a git worktree, run an agent, and attempt to merge changes."
    )
    .argument(
      "<service>",
      "Service to spawn (claude-code | codex | opencode)"
    )
    .argument("<prompt>", "Prompt to provide to the agent")
    .argument("[agentArgs...]", "Additional arguments forwarded to the agent")
    .option("--branch <name>", "Target branch to merge into")
    .action(
      async (
        service: string,
        promptText: string,
        agentArgs: string[] | undefined,
        commandOptions: SpawnWorktreeCommandOptions
      ) => {
        const adapter = serviceRegistry.get(service);
        if (!adapter) {
          throw new Error(`Unknown service "${service}".`);
        }
        if (!adapter.supportsSpawn) {
          throw new Error(`${adapter.label} does not support spawn.`);
        }

        const opts = program.optsWithGlobals();
        const isDryRun = Boolean(opts.dryRun);
        const isVerbose = Boolean(opts.verbose);
        const forwardedArgs = agentArgs ?? [];

        if (isDryRun) {
          const suffix =
            forwardedArgs.length > 0
              ? ` with args ${JSON.stringify(forwardedArgs)}`
              : "";
          const branchSuffix = commandOptions.branch
            ? ` into ${commandOptions.branch}`
            : "";
          logger(
            `Dry run: would create git worktree, run ${adapter.label}${suffix}, and merge${branchSuffix}.`
          );
          return;
        }

        const runner = isVerbose
          ? createLoggingCommandRunner(commandRunner, logger)
          : commandRunner;
        const currentBranch =
          commandOptions.branch ??
          (
            await createSimpleGit({ baseDir: environment.cwd }).revparse([
              "--abbrev-ref",
              "HEAD"
            ])
          ).trim();

        await spawnGitWorktree({
          agent: service,
          prompt: promptText,
          agentArgs: forwardedArgs,
          basePath: environment.cwd,
          targetBranch: currentBranch,
          logger,
          runAgent: async ({ agent, prompt, args }) => {
            if (agent !== service) {
              throw new Error(
                `Mismatched agent request "${agent}" (expected "${service}").`
              );
            }
            return await runAgentForWorktree(service, prompt, args, runner);
          }
        });
      }
    );

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

function logToolCallEvent(event: AgentToolCallEvent, logger: LoggerFn): void {
  const serializedArgs = JSON.stringify(event.args);
  if (event.error) {
    logger(`Tool ${event.toolName} failed: ${event.error}`);
    return;
  }
  if (event.result) {
    logger(`Tool ${event.toolName} result: ${event.result}`);
    return;
  }
  logger(`Tool ${event.toolName} invoked with args ${serializedArgs}`);
}

interface CommandContextInit {
  baseFs: FileSystem;
  isDryRun: boolean;
  logger: LoggerFn;
  runCommand: CommandRunner;
}

interface MutationLogEntry {
  command: string;
  message: string;
}

interface CommandContext {
  fs: FileSystem;
  prerequisites: PrerequisiteManager;
  recordMutation?: (entry: MutationLogEntry) => void;
  runCommand: CommandRunner;
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
      runCommand: init.runCommand,
      complete(messages) {
        init.logger(messages.success);
      }
    };
  }

  const recorder = new DryRunRecorder();
  const dryFs = createDryRunFileSystem(init.baseFs, recorder);
  const mutationEntries: MutationLogEntry[] = [];
  const recordedCommands = new Set<string>();

  const recordMutation = (entry: MutationLogEntry) => {
    mutationEntries.push(entry);
    recordedCommands.add(entry.command);
  };

  return {
    fs: dryFs,
    prerequisites,
    recordMutation,
    runCommand: init.runCommand,
    complete(messages) {
      init.logger(messages.dry);
      for (const entry of mutationEntries) {
        init.logger(entry.message);
      }
      for (const line of formatDryRunOperations(recorder.drain())) {
        const base = extractBaseCommand(line);
        if (!recordedCommands.has(base)) {
          init.logger(line);
          recordedCommands.add(base);
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
  options: { verbose: boolean; collector?: (entry: MutationLogEntry) => void }
): ServiceMutationHooks | undefined {
  const { verbose, collector } = options;
  if (!verbose && !collector) {
    return undefined;
  }

  const emit = (entry: MutationLogEntry) => {
    collector?.(entry);
    if (verbose) {
      logger(entry.message);
    }
  };

  return {
    onStart() {
      // only log on completion/error
    },
    onComplete(details, outcome) {
      const command = formatMutationCommand(details, outcome);
      const message = decorateMutationCommand(command, outcome);
      emit({ command, message });
    },
    onError(details, error) {
      const command = formatMutationCommand(details);
      const errorMessage = renderMutationError(command, error);
      logger(errorMessage);
      collector?.({ command, message: errorMessage });
    }
  };
}

function renderMutationError(command: string, error: unknown): string {
  const info = error instanceof Error ? error.message : String(error);
  return chalk.red(`${command} ! ${info}`);
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

function resolveVsCodeSettingsPath(
  platform: NodeJS.Platform,
  homeDir: string,
  variables: Record<string, string | undefined>
): string | null {
  if (platform === "darwin") {
    return path.join(
      homeDir,
      "Library",
      "Application Support",
      "Code",
      "User",
      "settings.json"
    );
  }
  if (platform === "win32") {
    const base = variables.APPDATA ?? path.join(homeDir, "AppData", "Roaming");
    return path.join(base, "Code", "User", "settings.json");
  }
  // Default to Linux-style config directory.
  return path.join(homeDir, ".config", "Code", "User", "settings.json");
}

function formatAutoImportPath(homeDir: string, targetPath: string): string {
  const normalizedHome = path.resolve(homeDir);
  const normalizedTarget = path.resolve(targetPath);
  if (normalizedTarget === normalizedHome) {
    return "~";
  }
  if (normalizedTarget.startsWith(normalizedHome)) {
    const suffix = normalizedTarget.slice(normalizedHome.length);
    const trimmed = suffix.startsWith(path.sep) ? suffix.slice(1) : suffix;
    if (trimmed.length === 0) {
      return "~";
    }
    const segments = trimmed.split(path.sep);
    return `~/${segments.join("/")}`;
  }
  return normalizedTarget.split(path.sep).join("/");
}

function stripAnsi(value: string): string {
  return value.replace(/\u001B\[[0-9;]*m/g, "");
}

function extractBaseCommand(line: string): string {
  const raw = stripAnsi(line);
  const hashIndex = raw.indexOf(" #");
  const base = hashIndex >= 0 ? raw.slice(0, hashIndex) : raw;
  return base.trim();
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
  defaultValue?: string,
  options?: {
    type?: string;
  }
): Promise<string> {
  if (value != null) {
    return value;
  }
  if (defaultValue != null) {
    return defaultValue;
  }

  const response = await prompts({
    type: options?.type ?? "text",
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
