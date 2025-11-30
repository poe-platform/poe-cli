import type { Command } from "commander";
import type { CliContainer } from "../container.js";
import type { ProviderContext, ProviderService } from "../service-registry.js";
import {
  buildProviderContext,
  createExecutionResources,
  type CommandFlags,
  resolveCommandFlags,
  resolveServiceAdapter,
  resolveProviderHandler
} from "./shared.js";
import { renderServiceMenu } from "../ui/service-menu.js";
import { createMenuTheme } from "../ui/theme.js";
import { saveConfiguredService } from "../../services/credentials.js";
import {
  combineMutationObservers,
  createMutationReporter
} from "../../services/mutation-events.js";
import type { ServiceMutationObservers } from "../../services/service-manifest.js";
import type {
  ModelPromptInput,
  ReasoningPromptInput
} from "../prompts.js";

export interface ConfigureCommandOptions {
  apiKey?: string;
  model?: string;
  reasoningEffort?: string;
}

export function registerConfigureCommand(
  program: Command,
  container: CliContainer
): Command {
  const configureCommand = program
    .command("configure")
    .description("Configure developer tooling for Poe API.")
    .argument(
      "[service]",
      "Service to configure (claude-code | codex | opencode)"
    )
    .option("--api-key <key>", "Poe API key")
    .option("--model <model>", "Model identifier")
    .option("--reasoning-effort <level>", "Reasoning effort level")
    .action(
      async (service: string | undefined, options: ConfigureCommandOptions) => {
        const resolved = await resolveServiceArgument(
          program,
          container,
          service
        );
        await executeConfigure(program, container, resolved, options);
      }
    );

  return configureCommand;
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

  const payload = await createConfigurePayload({
    service,
    container,
    flags,
    options,
    context: providerContext,
    adapter
  });

  await container.registry.invoke(service, "configure", async (entry) => {
    if (!entry.configure) {
      throw new Error(`Service "${service}" does not support configure.`);
    }
    const resolution = await resolveProviderHandler(entry, providerContext);
    const tracker = createMutationTracker();
    const mutationLogger = createMutationReporter(resources.logger);
    const observers = combineMutationObservers(tracker.observers, mutationLogger);
    await resolution.adapter.configure(
      {
        fs: providerContext.command.fs,
        env: providerContext.env,
        command: providerContext.command,
        options: payload
      },
      observers
        ? {
            observers
          }
        : undefined
    );

    if (!flags.dryRun) {
      await saveConfiguredService({
        fs: container.fs,
        filePath: providerContext.env.credentialsPath,
        service,
        metadata: {
          version: resolution.version,
          files: tracker.files()
        }
      });
    }
  });

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
  flags: CommandFlags;
  options: ConfigureCommandOptions;
  context: ProviderContext;
  adapter: ProviderService;
}

async function createConfigurePayload(
  init: ConfigurePayloadInit
): Promise<unknown> {
  const { service, container, flags, options, context, adapter } = init;
  switch (service) {
    case "claude-code": {
      const apiKey = await container.options.resolveApiKey({
        value: options.apiKey,
        dryRun: flags.dryRun
      });
      const modelPrompt = requireModelPrompt(adapter);
      const defaultModel = await container.options.resolveModel({
        value: options.model,
        assumeDefault: flags.assumeYes,
        defaultValue: modelPrompt.defaultValue,
        choices: modelPrompt.choices,
        label: modelPrompt.label
      });
      return {
        env: context.env,
        apiKey,
        defaultModel
      };
    }
    case "codex": {
      const apiKey = await container.options.resolveApiKey({
        value: options.apiKey,
        dryRun: flags.dryRun
      });
      const modelPrompt = requireModelPrompt(adapter);
      const model = await container.options.resolveModel({
        value: options.model,
        assumeDefault: flags.assumeYes,
        defaultValue: modelPrompt.defaultValue,
        choices: modelPrompt.choices,
        label: modelPrompt.label
      });
      const reasoningPrompt = requireReasoningPrompt(adapter);
      const reasoningEffort = await container.options.resolveReasoning({
        value: options.reasoningEffort,
        defaultValue: reasoningPrompt.defaultValue,
        label: reasoningPrompt.label
      });
      return {
        env: context.env,
        apiKey,
        model,
        reasoningEffort
      };
    }
    case "opencode": {
      const apiKey = await container.options.resolveApiKey({
        value: options.apiKey,
        dryRun: flags.dryRun
      });
      const modelPrompt = requireModelPrompt(adapter);
      const model = await container.options.resolveModel({
        value: options.model,
        assumeDefault: flags.assumeYes,
        defaultValue: modelPrompt.defaultValue,
        choices: modelPrompt.choices,
        label: modelPrompt.label
      });
      return {
        env: context.env,
        apiKey,
        model
      };
    }
    case "kimi": {
      const apiKey = await container.options.resolveApiKey({
        value: options.apiKey,
        dryRun: flags.dryRun
      });
      const modelPrompt = requireModelPrompt(adapter);
      const defaultModel = await container.options.resolveModel({
        value: options.model,
        assumeDefault: flags.assumeYes,
        defaultValue: modelPrompt.defaultValue,
        choices: modelPrompt.choices,
        label: modelPrompt.label
      });
      return {
        env: context.env,
        apiKey,
        defaultModel
      };
    }
    default:
      throw new Error(`Unknown service "${service}".`);
  }
}

function createMutationTracker(): {
  observers: ServiceMutationObservers;
  files(): string[];
} {
  const targets = new Set<string>();
  const observers: ServiceMutationObservers = {
    onComplete(details, outcome) {
      if (!outcome.changed || !details.targetPath) {
        return;
      }
      if (outcome.effect !== "write" && outcome.effect !== "delete") {
        return;
      }
      targets.add(details.targetPath);
    }
  };

  return {
    observers,
    files() {
      return Array.from(targets).sort();
    }
  };
}

function requireModelPrompt(
  adapter: ProviderService
): ModelPromptInput {
  const prompt = adapter.configurePrompts?.model;
  if (!prompt) {
    throw new Error(`${adapter.label} must define a model prompt.`);
  }
  return prompt;
}

function requireReasoningPrompt(
  adapter: ProviderService
): ReasoningPromptInput {
  const prompt = adapter.configurePrompts?.reasoningEffort;
  if (!prompt) {
    throw new Error(`${adapter.label} must define a reasoning prompt.`);
  }
  return prompt;
}

export async function resolveServiceArgument(
  program: Command,
  container: CliContainer,
  provided?: string
): Promise<string> {
  if (provided) {
    return provided;
  }
  const services = container.registry.list();
  if (services.length === 0) {
    throw new Error("No services available to configure.");
  }
  const flags = resolveCommandFlags(program);
  const logger = container.loggerFactory.create({
    dryRun: flags.dryRun,
    verbose: true,
    scope: "configure"
  });
  const menuTheme = createMenuTheme(container.env);
  const menuLines = renderServiceMenu(services, { theme: menuTheme });
  menuLines.forEach((line) => logger.info(line));
  const descriptor = container.promptLibrary.serviceSelection();
  const response = await container.prompts(descriptor);
  const selection = response[descriptor.name];
  const normalized =
    typeof selection === "number"
      ? selection
      : typeof selection === "string"
      ? Number.parseInt(selection, 10)
      : NaN;
  if (!Number.isInteger(normalized)) {
    throw new Error("Invalid service selection.");
  }
  const index = normalized - 1;
  if (index < 0 || index >= services.length) {
    throw new Error("Invalid service selection.");
  }
  return services[index].name;
}
