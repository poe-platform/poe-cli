export interface ProviderAdapter {
  name: string;
  label: string;
  supportsSpawn?: boolean;
  configure?: (...args: any[]) => Promise<unknown> | unknown;
  remove?: (...args: any[]) => Promise<unknown> | unknown;
  spawn?: (...args: any[]) => Promise<unknown> | unknown;
  registerPrerequisites?: (...args: any[]) => void;
}

export interface ServiceRegistry {
  register: (adapter: ProviderAdapter) => void;
  get: (name: string) => ProviderAdapter | undefined;
  require: (name: string) => ProviderAdapter;
  list: () => ProviderAdapter[];
}

export function createServiceRegistry(): ServiceRegistry {
  const adapters = new Map<string, ProviderAdapter>();

  const register = (adapter: ProviderAdapter): void => {
    if (adapters.has(adapter.name)) {
      throw new Error(`Provider "${adapter.name}" is already registered.`);
    }
    adapters.set(adapter.name, adapter);
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

  return { register, get, require, list };
}
