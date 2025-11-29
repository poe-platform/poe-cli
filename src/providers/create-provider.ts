
import { satisfies } from "semver";
import type {
  ProviderService,
  ProviderContext,
  ProviderBranding,
  ProviderConfigurePrompts
} from "../cli/service-registry.js";
import type { CliEnvironment } from "../cli/environment.js";
import {
  createServiceManifest,
  type ServiceManifestDefinition
} from "../services/service-manifest.js";
import {
  runServiceInstall,
  type ServiceInstallDefinition
} from "../services/service-install.js";
import type { HookDefinition } from "../utils/hooks.js";
import type { ProviderVersionResolver } from "./versioned-provider.js";

interface ProviderHooksConfig {
  before?: HookDefinition[];
  after?: HookDefinition[];
}

interface ManifestVersionDefinition<ConfigureOptions, RemoveOptions> {
  hooks?: ServiceManifestDefinition<ConfigureOptions, RemoveOptions>["hooks"];
  configure: ServiceManifestDefinition<ConfigureOptions, RemoveOptions>["configure"];
  remove?: ServiceManifestDefinition<ConfigureOptions, RemoveOptions>["remove"];
}

interface CreateProviderOptions<
  TPaths extends Record<string, string>,
  ConfigureOptions,
  RemoveOptions,
  SpawnOptions
> {
  name: string;
  label: string;
  id: string;
  summary: string;
  branding?: ProviderBranding;
  disabled?: boolean;
  configurePrompts?: ProviderConfigurePrompts;
  manifest:
    | ServiceManifestDefinition<ConfigureOptions, RemoveOptions>
    | Record<string, ManifestVersionDefinition<ConfigureOptions, RemoveOptions>>;
  install?: ServiceInstallDefinition;
  hooks?: ProviderHooksConfig;
  resolvePaths?: (env: CliEnvironment) => TPaths;
  spawn?: ProviderService<
    TPaths,
    ConfigureOptions,
    RemoveOptions,
    SpawnOptions
  >["spawn"];
  versionResolver?: ProviderVersionResolver<TPaths>;
}

interface ManifestEntry<ConfigureOptions, RemoveOptions> {
  range: string;
  manifest: ReturnType<
    typeof createServiceManifest<ConfigureOptions, RemoveOptions>
  >;
}

export function createProvider<
  TPaths extends Record<string, string> = Record<string, string>,
  ConfigureOptions = unknown,
  RemoveOptions = ConfigureOptions,
  SpawnOptions = unknown
>(
  options: CreateProviderOptions<
    TPaths,
    ConfigureOptions,
    RemoveOptions,
    SpawnOptions
  >
): ProviderService<TPaths, ConfigureOptions, RemoveOptions, SpawnOptions> {
  const manifestEntries = buildManifestEntries(options);
  const defaultManifest =
    manifestEntries.find((entry) => entry.range === "*")?.manifest ??
    manifestEntries[0]!.manifest;

  const provider: ProviderService<
    TPaths,
    ConfigureOptions,
    RemoveOptions,
    SpawnOptions
  > = {
    id: options.id,
    summary: options.summary,
    name: options.name,
    label: options.label,
    branding: options.branding,
    disabled: options.disabled,
    configurePrompts: options.configurePrompts,
    hooks: options.hooks,
    resolvePaths:
      options.resolvePaths ??
      ((() => ({} as TPaths)) as ProviderService<
        TPaths,
        ConfigureOptions,
        RemoveOptions,
        SpawnOptions
      >["resolvePaths"]),
    async configure(context, runOptions) {
      await defaultManifest.configure(context, runOptions);
    },
    async remove(context, runOptions) {
      return defaultManifest.remove(context, runOptions);
    }
  };

  if (options.install) {
    provider.install = createInstallRunner(options.install);
  }

  if (options.spawn) {
    provider.spawn = options.spawn;
  }

  const hasMultipleVersions = manifestEntries.length > 1;
  if (hasMultipleVersions || options.versionResolver) {
    provider.resolveVersion = async (context) => {
      const version = options.versionResolver
        ? await safeResolveVersion(options.versionResolver, context)
        : null;
      const manifest = selectManifest(manifestEntries, version) ?? defaultManifest;
      const variant = bindManifest(provider, manifest, version);
      return { version, adapter: variant };
    };
  }

  return provider;
}

function buildManifestEntries<
  TPaths extends Record<string, string>,
  ConfigureOptions,
  RemoveOptions
>(
  options: CreateProviderOptions<TPaths, ConfigureOptions, RemoveOptions, unknown>
): ManifestEntry<ConfigureOptions, RemoveOptions>[] {
  const input = options.manifest;
  const map = isVersionedManifest(input)
    ? input
    : { "*": input };

  return Object.entries(map).map(([range, definition]) => {
    const normalized: ServiceManifestDefinition<ConfigureOptions, RemoveOptions> =
      isVersionedManifest(input)
        ? {
            id: options.id,
            summary: options.summary,
            hooks: definition.hooks,
            configure: definition.configure,
            remove: definition.remove
          }
        : (definition as ServiceManifestDefinition<ConfigureOptions, RemoveOptions>);

    return {
      range,
      manifest: createServiceManifest(normalized)
    };
  });
}

function isVersionedManifest<ConfigureOptions, RemoveOptions>(
  value: CreateProviderOptions<
    Record<string, string>,
    ConfigureOptions,
    RemoveOptions,
    unknown
  >["manifest"]
): value is Record<
  string,
  ManifestVersionDefinition<ConfigureOptions, RemoveOptions>
> {
  if (typeof value !== "object" || value == null || Array.isArray(value)) {
    return false;
  }
  return !("id" in value && "summary" in value);
}

async function safeResolveVersion<TPaths extends Record<string, string>>(
  resolver: ProviderVersionResolver<TPaths>,
  context: ProviderContext<TPaths>
): Promise<string | null> {
  try {
    return await resolver(context);
  } catch (error) {
    context.logger.verbose(
      `Version detection failed: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return null;
  }
}

function selectManifest<ConfigureOptions, RemoveOptions>(
  entries: ManifestEntry<ConfigureOptions, RemoveOptions>[],
  version: string | null
) {
  if (version) {
    for (const entry of entries) {
      if (entry.range === "*") {
        continue;
      }
      if (satisfies(version, entry.range, { includePrerelease: true })) {
        return entry.manifest;
      }
    }
  }
  return entries.find((entry) => entry.range === "*")?.manifest ?? null;
}

function bindManifest<
  TPaths extends Record<string, string>,
  ConfigureOptions,
  RemoveOptions,
  SpawnOptions
>(
  base: ProviderService<TPaths, ConfigureOptions, RemoveOptions, SpawnOptions>,
  manifest: ReturnType<
    typeof createServiceManifest<ConfigureOptions, RemoveOptions>
  >,
  version: string | null
): ProviderService<TPaths, ConfigureOptions, RemoveOptions, SpawnOptions> {
  if (
    base.configure === manifest.configure &&
    base.remove === manifest.remove
  ) {
    return base;
  }
  return {
    ...base,
    configure(context, runOptions) {
      return manifest.configure(context, runOptions);
    },
    remove(context, runOptions) {
      return manifest.remove(context, runOptions);
    },
    resolveVersion: async () => ({ version, adapter: base })
  };
}

function createInstallRunner<TPaths extends Record<string, string>>(
  definition: ServiceInstallDefinition
) {
  return async (context: ProviderContext<TPaths>): Promise<void> => {
    await runServiceInstall(definition, {
      isDryRun: context.logger.context.dryRun,
      runCommand: context.command.runCommand,
      logger: (message) => context.logger.info(message)
    });
  };
}
