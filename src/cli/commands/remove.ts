import type { Command } from "commander";
import type { CliContainer } from "../container.js";
import {
  buildProviderContext,
  createExecutionResources,
  type ExecutionResources,
  resolveCommandFlags
} from "./shared.js";
import { DEFAULT_ROO_CONFIG_NAME } from "../constants.js";

export interface RemoveCommandOptions {
  configName?: string;
}

export function registerRemoveCommand(
  program: Command,
  container: CliContainer
): void {
  program
    .command("remove")
    .description("Remove existing Poe API tooling configuration.")
    .argument(
      "<service>",
      "Service to remove (claude-code | codex | opencode | roo-code)"
    )
    .option("--config-name <name>", "Configuration profile name")
    .action(async (service: string, options: RemoveCommandOptions) => {
      const adapter = container.registry.require(service);
      const flags = resolveCommandFlags(program);
      const resources = createExecutionResources(
        container,
        flags,
        `remove:${service}`
      );
      const providerContext = buildProviderContext(
        container,
        adapter,
        resources
      );

      const payload = await createRemovePayload(
        service,
        container,
        options,
        resources
      );

      const removed = await container.registry.invoke(
        service,
        "remove",
        async (entry) => {
          if (!entry.remove) {
            throw new Error(`Service "${service}" does not support remove.`);
          }
          return await entry.remove(providerContext, payload);
        }
      );

      const messages = formatRemovalMessages(service, adapter.label, removed, payload);

      resources.context.complete(messages);
    });
}

async function createRemovePayload(
  service: string,
  container: CliContainer,
  options: RemoveCommandOptions,
  resources: ExecutionResources
): Promise<unknown> {
  const mutationHooks = resources.mutationHooks;
  if (service === "roo-code") {
    const configName = await container.options.resolveConfigName(
      options.configName,
      DEFAULT_ROO_CONFIG_NAME
    );
    return {
      configName,
      mutationHooks
    };
  }
  return { mutationHooks };
}

function formatRemovalMessages(
  service: string,
  label: string,
  removed: unknown,
  payload: unknown
): { success: string; dry: string } {
  const didRemove = typeof removed === "boolean" ? removed : Boolean(removed);
  switch (service) {
    case "claude-code":
      return {
        success: didRemove
          ? "Removed Claude Code configuration."
          : "No Claude Code configuration found.",
        dry: "Dry run: would remove Claude Code configuration."
      };
    case "codex":
      return {
        success: didRemove
          ? "Removed Codex configuration."
          : "No Codex configuration found.",
        dry: "Dry run: would remove Codex configuration."
      };
    case "opencode":
      return {
        success: didRemove
          ? "Removed OpenCode CLI configuration."
          : "No OpenCode CLI configuration found.",
        dry: "Dry run: would remove OpenCode CLI configuration."
      };
    case "roo-code": {
      const configName =
        typeof (payload as { configName?: string }).configName === "string"
          ? (payload as { configName?: string }).configName!
          : DEFAULT_ROO_CONFIG_NAME;
      return {
        success: didRemove
          ? `Removed Roo Code configuration "${configName}".`
          : `No Roo Code configuration named "${configName}" found.`,
        dry: "Dry run: would remove Roo Code configuration."
      };
    }
    default:
      return {
        success: didRemove
          ? `Removed ${label} configuration.`
          : `No ${label} configuration found.`,
        dry: `Dry run: would remove ${label} configuration.`
      };
  }
}
