import type { FileSystem } from "../utils/file-system.js";
import {
  loadCredentials,
  saveCredentials
} from "../services/credentials.js";
import { createCliEnvironment } from "./environment.js";
import {
  createServiceRegistry,
  type ProviderAdapter
} from "./service-registry.js";
import {
  createCommandContextFactory,
  type CommandContextFactory
} from "./context.js";
import { createPromptLibrary } from "./prompts.js";
import {
  createOptionResolvers,
  type OptionResolvers
} from "./options.js";
import {
  createLoggerFactory,
  type LoggerFactory,
  type ScopedLogger
} from "./logger.js";
import { createTelemetryClient } from "./telemetry.js";
import { createPoeApiClient, type PoeApiClient } from "./api-client.js";
import { createDefaultCommandRunner } from "./command-runner.js";
import type { PromptFn, LoggerFn } from "./types.js";
import type { HttpClient } from "./http.js";
import type { CommandRunner } from "../utils/prerequisites.js";
import { getDefaultProviders } from "../providers/index.js";
import type {
  ChatServiceFactory,
  ChatServiceFactoryOptions,
  AgentSession
} from "./chat.js";

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

export interface CliContainer {
  readonly env: ReturnType<typeof createCliEnvironment>;
  readonly fs: FileSystem;
  readonly prompts: PromptFn;
  readonly promptLibrary: ReturnType<typeof createPromptLibrary>;
  readonly loggerFactory: LoggerFactory;
  readonly options: OptionResolvers;
  readonly contextFactory: CommandContextFactory;
  readonly registry: ReturnType<typeof createServiceRegistry>;
  readonly httpClient: HttpClient;
  readonly poeApiClient: PoeApiClient;
  readonly commandRunner: CommandRunner;
  readonly chatServiceFactory: ChatServiceFactory;
  readonly telemetryLogger: ScopedLogger;
  readonly providers: ProviderAdapter[];
  readonly dependencies: CliDependencies;
}

export function createCliContainer(
  dependencies: CliDependencies
): CliContainer {
  const environment = createCliEnvironment({
    cwd: dependencies.env.cwd,
    homeDir: dependencies.env.homeDir,
    platform: dependencies.env.platform,
    variables: dependencies.env.variables
  });

  const loggerFactory = createLoggerFactory(
    dependencies.logger ?? ((message) => console.log(message))
  );

  const contextFactory = createCommandContextFactory({
    fs: dependencies.fs
  });

  const httpClient: HttpClient =
    dependencies.httpClient ??
    (async (url, init) => {
      const response = await globalThis.fetch(url, init);
      return {
        ok: response.ok,
        status: response.status,
        json: () => response.json()
      };
    });

  const commandRunner =
    dependencies.commandRunner ?? createDefaultCommandRunner();

  const chatServiceFactory: ChatServiceFactory =
    dependencies.chatServiceFactory ??
    (async (options) => {
      const { createAgentSession } = (await import(
        "../services/agent-session.js"
      )) as {
        createAgentSession: (
          input: ChatServiceFactoryOptions
        ) => Promise<AgentSession>;
      };
      return await createAgentSession(options);
    });

  const promptLibrary = createPromptLibrary();

  const options = createOptionResolvers({
    prompts: dependencies.prompts,
    promptLibrary,
    apiKeyStore: {
      read: () =>
        loadCredentials({
          fs: dependencies.fs,
          filePath: environment.credentialsPath
        }),
      write: (value) =>
        saveCredentials({
          fs: dependencies.fs,
          filePath: environment.credentialsPath,
          apiKey: value
        })
    }
  });

  const telemetryLogger = loggerFactory.create({
    scope: "telemetry",
    verbose: true
  });

  const registry = createServiceRegistry({
    telemetry: createTelemetryClient(telemetryLogger)
  });

  const providers = getDefaultProviders();
  for (const adapter of providers) {
    registry.register(adapter);
  }

  return {
    env: environment,
    fs: dependencies.fs,
    prompts: dependencies.prompts,
    promptLibrary,
    loggerFactory,
    options,
    contextFactory,
    registry,
    httpClient,
    poeApiClient: createPoeApiClient(httpClient),
    commandRunner,
    chatServiceFactory,
    telemetryLogger,
    providers,
    dependencies
  };
}
