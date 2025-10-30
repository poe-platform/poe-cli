import type { Command } from "commander";
import type { CliContainer } from "../container.js";
import {
  buildProviderContext,
  createExecutionResources,
  type ExecutionResources,
  registerProviderPrerequisites,
  resolveCommandFlags,
  resolveServiceAdapter,
  runPrerequisites
} from "./shared.js";
import {
  DEFAULT_MODEL,
  DEFAULT_REASONING,
  DEFAULT_ROO_BASE_URL,
  DEFAULT_ROO_CONFIG_NAME,
  DEFAULT_ROO_MODEL
} from "../constants.js";

export interface ConfigureCommandOptions {
  apiKey?: string;
  model?: string;
  reasoningEffort?: string;
  configName?: string;
  baseUrl?: string;
}

export function registerConfigureCommand(
  program: Command,
  container: CliContainer
): void {
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
      await executeConfigure(program, container, service, options);
    });
}

export async function executeConfigure(
  program: Command,
  container: CliContainer,
  service: string,
  options: ConfigureCommandOptions
): Promise<void> {
  const adapter = resolveServiceAdapter(container, service);
  const flags = resolveCommandFlags(program);
  const resources = createExecutionResources(
    container,
    flags,
    `configure:${service}`
  );
  const providerContext = buildProviderContext(
    container,
    adapter,
    resources
  );

  registerProviderPrerequisites(adapter, resources);

  await container.registry.invoke(service, "install", async (entry) => {
    if (!entry.install) {
      return;
    }
    await entry.install(providerContext);
  });

  await runPrerequisites(adapter, resources, "before");

  const payload = await createConfigurePayload({
    service,
    container,
    flags,
    options,
    resources
  });

  await container.registry.invoke(service, "configure", async (entry) => {
    if (!entry.configure) {
      throw new Error(`Service "${service}" does not support configure.`);
    }
    await entry.configure(providerContext, payload);
  });

  await runPrerequisites(adapter, resources, "after");

  const dryMessage =
    service === "claude-code"
      ? `${adapter.label} (dry run)`
      : `Dry run: would configure ${adapter.label}.`;

  resources.context.complete({
    success: `Configured ${adapter.label}.`,
    dry: dryMessage
  });
}

interface ConfigurePayloadInit {
  service: string;
  container: CliContainer;
  flags: { dryRun: boolean };
  options: ConfigureCommandOptions;
  resources: ExecutionResources;
}

async function createConfigurePayload(
  init: ConfigurePayloadInit
): Promise<unknown> {
  const { service, container, flags, options, resources } = init;
  const mutationHooks = resources.mutationHooks;
  switch (service) {
    case "claude-code": {
      const apiKey = await container.options.resolveApiKey({
        value: options.apiKey,
        dryRun: flags.dryRun
      });
      return {
        apiKey,
        mutationHooks
      };
    }
    case "codex": {
      const apiKey = await container.options.resolveApiKey({
        value: options.apiKey,
        dryRun: flags.dryRun
      });
      const model = await container.options.resolveModel(
        options.model,
        DEFAULT_MODEL
      );
      const reasoningEffort = await container.options.resolveReasoning(
        options.reasoningEffort,
        DEFAULT_REASONING
      );
      return {
        apiKey,
        model,
        reasoningEffort,
        mutationHooks
      };
    }
    case "opencode": {
      const apiKey = await container.options.resolveApiKey({
        value: options.apiKey,
        dryRun: flags.dryRun
      });
      return {
        apiKey,
        mutationHooks
      };
    }
    case "roo-code": {
      const apiKey = await container.options.resolveApiKey({
        value: options.apiKey,
        dryRun: flags.dryRun
      });
      const model = await container.options.resolveModel(
        options.model,
        DEFAULT_ROO_MODEL
      );
      const configName = await container.options.resolveConfigName(
        options.configName,
        DEFAULT_ROO_CONFIG_NAME
      );
      const baseUrl = options.baseUrl ?? DEFAULT_ROO_BASE_URL;
      return {
        apiKey,
        model,
        baseUrl,
        configName,
        mutationHooks
      };
    }
    default:
      throw new Error(`Unknown service "${service}".`);
  }
}
