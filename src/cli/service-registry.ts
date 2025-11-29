import type { CliEnvironment } from "./environment.js";
import type { CommandContext } from "./context.js";
import type { ScopedLogger } from "./logger.js";
import type { ProviderOperation, TelemetryClient } from "./telemetry.js";
import type { FileSystem } from "../utils/file-system.js";
import type { CommandCheck } from "../utils/command-checks.js";
import type {
  ModelPromptInput,
  ReasoningPromptInput
} from "./prompts.js";
import type { ServiceRunOptions } from "../services/service-manifest.js";

export interface ProviderColorSet {
  light?: string;
  dark?: string;
}

export interface ProviderBranding {
  colors?: ProviderColorSet;
}

export interface ProviderConfigurePrompts {
  model?: ModelPromptInput;
  reasoningEffort?: ReasoningPromptInput;
}

export interface ProviderContext<
  TPaths extends Record<string, unknown> = Record<string, any>
> {
  env: CliEnvironment;
  paths: TPaths;
  command: CommandContext;
  logger: ScopedLogger;
  runCheck(check: CommandCheck): Promise<void>;
}

export interface ServiceExecutionContext<Options> {
  fs: FileSystem;
  env: CliEnvironment;
  command: CommandContext;
  options: Options;
}

export interface ProviderVersionResolution<
  TPaths extends Record<string, unknown>,
  TConfigure,
  TRemove,
  TSpawn
> {
  version: string | null;
  adapter: ProviderService<TPaths, TConfigure, TRemove, TSpawn>;
}

export interface ProviderService<
  TPaths extends Record<string, unknown> = Record<string, any>,
  TConfigure = any,
  TRemove = TConfigure,
  TSpawn = any
> {
  id: string;
  summary: string;
  configure(
    context: ServiceExecutionContext<TConfigure>,
    runOptions?: ServiceRunOptions
  ): Promise<void>;
  remove(
    context: ServiceExecutionContext<TRemove>,
    runOptions?: ServiceRunOptions
  ): Promise<boolean>;
  name: string;
  label: string;
  branding?: ProviderBranding;
  disabled?: boolean;
  configurePrompts?: ProviderConfigurePrompts;
  resolvePaths?: (env: CliEnvironment) => TPaths;
  install?(context: ProviderContext<TPaths>): Promise<void> | void;
  spawn?(
    context: ProviderContext<TPaths>,
    options: TSpawn
  ): Promise<unknown>;
  test?(context: ProviderContext<TPaths>): Promise<void>;
  resolveVersion?(
    context: ProviderContext<TPaths>
  ): Promise<ProviderVersionResolution<TPaths, TConfigure, TRemove, TSpawn>>;
}

export interface ServiceRegistry {
  register(adapter: ProviderService): void;
  discover(adapters: ProviderService[]): void;
  get(name: string): ProviderService | undefined;
  require(name: string): ProviderService;
  list(): ProviderService[];
  invoke<T>(
    serviceName: string,
    operation: ProviderOperation,
    runner: (adapter: ProviderService) => Promise<T>
  ): Promise<T>;
}

export interface ServiceRegistryInit {
  telemetry?: TelemetryClient;
}

export function createServiceRegistry(
  init: ServiceRegistryInit = {}
): ServiceRegistry {
  const adapters = new Map<string, ProviderService>();

  const register = (adapter: ProviderService): void => {
    if (adapters.has(adapter.name)) {
      throw new Error(`Provider "${adapter.name}" is already registered.`);
    }
    adapters.set(adapter.name, adapter);
  };

  const discover = (candidates: ProviderService[]): void => {
    for (const candidate of candidates) {
      if (adapters.has(candidate.name)) {
        continue;
      }
      adapters.set(candidate.name, candidate);
    }
  };

  const get = (name: string): ProviderService | undefined => adapters.get(name);

  const require = (name: string): ProviderService => {
    const adapter = adapters.get(name);
    if (!adapter) {
      throw new Error(`Unknown provider "${name}".`);
    }
    return adapter;
  };

  const list = (): ProviderService[] => Array.from(adapters.values());

  const invoke = async <T>(
    serviceName: string,
    operation: ProviderOperation,
    runner: (adapter: ProviderService) => Promise<T>
  ): Promise<T> => {
    const adapter = require(serviceName);
    if (init.telemetry) {
      return await init.telemetry.wrap(serviceName, operation, () =>
        runner(adapter)
      );
    }
    return await runner(adapter);
  };

  return { register, discover, get, require, list, invoke };
}
