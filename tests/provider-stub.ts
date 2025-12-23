import type {
  ProviderService,
  ServiceExecutionContext
} from "../src/cli/service-registry.js";
import type { ServiceRunOptions } from "../src/services/service-manifest.js";

export function createProviderStub<
  ConfigureOptions = unknown,
  RemoveOptions = ConfigureOptions,
  SpawnOptions = unknown
>(
  overrides: Partial<
    ProviderService<ConfigureOptions, RemoveOptions, SpawnOptions>
  > &
    Pick<ProviderService<ConfigureOptions, RemoveOptions, SpawnOptions>, "name" | "label"> &
    Partial<Pick<ProviderService, "id" | "summary">>
): ProviderService<ConfigureOptions, RemoveOptions, SpawnOptions> {
  const id = overrides.id ?? overrides.name;
  const summary = overrides.summary ?? overrides.label;

  const defaultConfigure = async (
    _context: ServiceExecutionContext<ConfigureOptions>,
    _runOptions?: ServiceRunOptions
  ): Promise<void> => {};

  const defaultRemove = async (
    _context: ServiceExecutionContext<RemoveOptions>,
    _runOptions?: ServiceRunOptions
  ): Promise<boolean> => false;

  return {
    ...overrides,
    id,
    summary,
    configure: overrides.configure ?? defaultConfigure,
    remove: overrides.remove ?? defaultRemove
  };
}
