import type { Command } from "commander";
import type { CliContainer } from "../container.js";
import {
  createExecutionResources,
  normalizePhase,
  registerProviderPrerequisites,
  resolveCommandFlags,
  resolveServiceAdapter,
  runPrerequisites
} from "./shared.js";

export function registerPrerequisitesCommand(
  program: Command,
  container: CliContainer
): void {
  program
    .command("prerequisites")
    .description("Run prerequisite checks for a service.")
    .argument(
      "<service>",
      "Service to check (claude-code | codex | opencode)"
    )
    .argument("<phase>", "Phase to execute (before | after)")
    .action(async (service: string, phase: string) => {
      const normalizedPhase = normalizePhase(phase);
      const adapter = resolveServiceAdapter(container, service);
      const flags = resolveCommandFlags(program);
      const resources = createExecutionResources(
        container,
        flags,
        `prerequisites:${service}`
      );

      registerProviderPrerequisites(adapter, resources);

      await container.registry.invoke(service, "prerequisites", async () => {
        await runPrerequisites(adapter, resources, normalizedPhase);
      });

      resources.context.complete({
        success: `${adapter.label} ${normalizedPhase} prerequisites succeeded.`,
        dry: `Dry run: would run ${adapter.label} ${normalizedPhase} prerequisites.`
      });
    });
}
