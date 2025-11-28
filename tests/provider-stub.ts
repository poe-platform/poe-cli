import type {
  ProviderService,
  ServiceExecutionContext
} from "../src/cli/service-registry.js";
import type { ServiceRunOptions } from "../src/services/service-manifest.js";

export function createProviderStub<
  Paths extends Record<string, string> = Record<string, string>,
  ConfigureOptions = unknown,
  RemoveOptions = ConfigureOptions,
  SpawnOptions = unknown
>(
  overrides: Partial<
    ProviderService<Paths, ConfigureOptions, RemoveOptions, SpawnOptions>
  > &
    Pick<ProviderService<Paths, ConfigureOptions, RemoveOptions, SpawnOptions>, "name" | "label"> &
    Partial<Pick<ProviderService<Paths>, "id" | "summary">>
): ProviderService<Paths, ConfigureOptions, RemoveOptions, SpawnOptions> {
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
    prerequisites: overrides.prerequisites,
    resolvePaths:
      overrides.resolvePaths ?? ((() => ({} as Paths)) as ProviderService<
        Paths,
        ConfigureOptions,
        RemoveOptions,
        SpawnOptions
      >["resolvePaths"]),
    configure: overrides.configure ?? defaultConfigure,
    remove: overrides.remove ?? defaultRemove
  };
}
