import type { CliEnvironment } from "./environment.js";
import type { CommandContext } from "./context.js";
import type { ScopedLogger } from "./logger.js";
import type { ProviderOperation, TelemetryClient } from "./telemetry.js";
import type { FileSystem } from "../utils/file-system.js";

export interface ProviderColorSet {
  light?: string;
  dark?: string;
}

export interface ProviderBranding {
  colors?: ProviderColorSet;
}

export interface ProviderContext<TPaths = Record<string, string>> {
  env: CliEnvironment;
  paths: TPaths;
  command: CommandContext;
  logger: ScopedLogger;
}

export interface ServiceExecutionContext<Options> {
  fs: FileSystem;
  env: CliEnvironment;
  options: Options;
}

export interface ProviderService<
  TPaths = Record<string, string>,
  TConfigure = unknown,
  TRemove = unknown,
  TSpawn = unknown
> {
  id: string;
  summary: string;
  prerequisites?: {
    before?: string[];
    after?: string[];
  };
  configure(
    context: ServiceExecutionContext<TConfigure>
  ): Promise<void>;
  remove(
    context: ServiceExecutionContext<TRemove>
  ): Promise<boolean>;
  name: string;
  label: string;
  branding?: ProviderBranding;
  disabled?: boolean;
  resolvePaths?: (env: CliEnvironment) => TPaths;
  registerPrerequisites?: (
    manager: CommandContext["prerequisites"]
  ) => void;
  install?: (context: ProviderContext<TPaths>) => Promise<void> | void;
  spawn?: (
    context: ProviderContext<TPaths>,
    options: TSpawn
  ) => Promise<unknown>;
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
