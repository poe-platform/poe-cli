import type { Command } from "commander";
import type { CliContainer } from "../container.js";
import type { ProviderContext } from "../service-registry.js";
import {
  buildProviderContext,
  createExecutionResources,
  type CommandFlags,
  resolveCommandFlags,
  resolveServiceAdapter,
  resolveProviderHandler
} from "./shared.js";
import {
  DEFAULT_MODEL,
  DEFAULT_REASONING,
  DEFAULT_CLAUDE_MODEL
} from "../constants.js";
import { renderServiceMenu } from "../ui/service-menu.js";
import { createMenuTheme } from "../ui/theme.js";
import { saveConfiguredService } from "../../services/credentials.js";
import type { ServiceMutationHooks } from "../../services/service-manifest.js";

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
    context: providerContext
  });

  await container.registry.invoke(service, "configure", async (entry) => {
    if (!entry.configure) {
      throw new Error(`Service "${service}" does not support configure.`);
    }
    const resolution = await resolveProviderHandler(entry, providerContext);
    const tracker = createMutationTracker();
    await resolution.adapter.configure(
      {
        fs: providerContext.command.fs,
        env: providerContext.env,
        command: providerContext.command,
        options: payload
      },
      { hooks: tracker.hooks }
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
}

async function createConfigurePayload(
  init: ConfigurePayloadInit
): Promise<unknown> {
  const { service, container, flags, options, context } = init;
  switch (service) {
    case "claude-code": {
      const apiKey = await container.options.resolveApiKey({
        value: options.apiKey,
        dryRun: flags.dryRun
      });
      const defaultModel = await container.options.resolveClaudeModel({
        value: options.model,
        defaultValue: DEFAULT_CLAUDE_MODEL,
        assumeDefault: flags.assumeYes
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
      const model = await container.options.resolveModel(
        options.model,
        DEFAULT_MODEL
      );
      const reasoningEffort = await container.options.resolveReasoning(
        options.reasoningEffort,
        DEFAULT_REASONING
      );
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
      return {
        env: context.env,
        apiKey
      };
    }
    default:
      throw new Error(`Unknown service "${service}".`);
  }
}

function createMutationTracker(): {
  hooks: ServiceMutationHooks;
  files(): string[];
} {
  const targets = new Set<string>();
  const hooks: ServiceMutationHooks = {
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
    hooks,
    files() {
      return Array.from(targets).sort();
    }
  };
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
    verbose: flags.verbose,
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
