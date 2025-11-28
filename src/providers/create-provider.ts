import type {
  ProviderService,
  ProviderContext,
  ProviderBranding
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
import type { PrerequisiteDefinition } from "../utils/prerequisites.js";

interface ProviderHooksConfig {
  before?: PrerequisiteDefinition[];
  after?: PrerequisiteDefinition[];
}

interface CreateProviderOptions<
  TPaths extends Record<string, string>,
  ConfigureOptions,
  RemoveOptions,
  SpawnOptions
> {
  name: string;
  label: string;
  branding?: ProviderBranding;
  disabled?: boolean;
  manifest: ServiceManifestDefinition<ConfigureOptions, RemoveOptions>;
  install?: ServiceInstallDefinition;
  hooks?: ProviderHooksConfig;
  resolvePaths?: (env: CliEnvironment) => TPaths;
  spawn?: ProviderService<
    TPaths,
    ConfigureOptions,
    RemoveOptions,
    SpawnOptions
  >["spawn"];
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
  const manifest = createServiceManifest<ConfigureOptions, RemoveOptions>(
    options.manifest
  );
  const provider: ProviderService<
    TPaths,
    ConfigureOptions,
    RemoveOptions,
    SpawnOptions
  > = {
    ...manifest,
    name: options.name,
    label: options.label,
    branding: options.branding,
    disabled: options.disabled,
    hooks: options.hooks,
    resolvePaths:
      options.resolvePaths ??
      ((() => ({} as TPaths)) as ProviderService<
        TPaths,
        ConfigureOptions,
        RemoveOptions,
        SpawnOptions
      >["resolvePaths"])
  };

  if (options.install) {
    provider.install = createInstallRunner(options.install);
  }

  if (options.spawn) {
    provider.spawn = options.spawn;
  }

  return provider;
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
