import type { CliEnvironment } from "./environment.js";
import type { CommandContext } from "./context.js";
import type { ScopedLogger } from "./logger.js";
import type { ProviderOperation, TelemetryClient } from "./telemetry.js";

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

export interface ProviderAdapter<
  TPaths = Record<string, string>,
  TConfigure = unknown,
  TRemove = unknown,
  TSpawn = unknown
> {
  name: string;
  label: string;
  branding?: ProviderBranding;
  disabled?: boolean;
  supportsSpawn?: boolean;
  resolvePaths(env: CliEnvironment): TPaths;
  registerPrerequisites?: (
    manager: CommandContext["prerequisites"]
  ) => void;
  install?: (context: ProviderContext<TPaths>) => Promise<void> | void;
  configure?: (
    context: ProviderContext<TPaths>,
    options: TConfigure
  ) => Promise<void> | void;
  remove?: (
    context: ProviderContext<TPaths>,
    options: TRemove
  ) => Promise<boolean | void> | boolean | void;
  spawn?: (
    context: ProviderContext<TPaths>,
    options: TSpawn
  ) => Promise<unknown>;
}

export interface ServiceRegistry {
  register(adapter: ProviderAdapter): void;
  discover(adapters: ProviderAdapter[]): void;
  get(name: string): ProviderAdapter | undefined;
  require(name: string): ProviderAdapter;
  list(): ProviderAdapter[];
  invoke<T>(
    serviceName: string,
    operation: ProviderOperation,
    runner: (adapter: ProviderAdapter) => Promise<T>
  ): Promise<T>;
}

export interface ServiceRegistryInit {
  telemetry?: TelemetryClient;
}

export function createServiceRegistry(
  init: ServiceRegistryInit = {}
): ServiceRegistry {
  const adapters = new Map<string, ProviderAdapter>();

  const register = (adapter: ProviderAdapter): void => {
    if (adapters.has(adapter.name)) {
      throw new Error(`Provider "${adapter.name}" is already registered.`);
    }
    adapters.set(adapter.name, adapter);
  };

  const discover = (candidates: ProviderAdapter[]): void => {
    for (const candidate of candidates) {
      if (adapters.has(candidate.name)) {
        continue;
      }
      adapters.set(candidate.name, candidate);
    }
  };

  const get = (name: string): ProviderAdapter | undefined => adapters.get(name);

  const require = (name: string): ProviderAdapter => {
    const adapter = adapters.get(name);
    if (!adapter) {
      throw new Error(`Unknown provider "${name}".`);
    }
    return adapter;
  };

  const list = (): ProviderAdapter[] => Array.from(adapters.values());

  const invoke = async <T>(
    serviceName: string,
    operation: ProviderOperation,
    runner: (adapter: ProviderAdapter) => Promise<T>
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
