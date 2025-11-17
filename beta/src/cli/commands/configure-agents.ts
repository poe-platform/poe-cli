import type { Command } from "commander";
import type { CliContainer } from "../container.js";
import { resolveCommandFlags } from "./shared.js";
import { AgentConfigManager } from "../../services/agent-config-manager.js";
import { createDefaultAgentRegistry } from "../../services/agent-registry.js";

export function registerConfigureAgentsCommand(
  configureCommand: Command,
  container: CliContainer
): void {
  configureCommand
    .command("agents")
    .description("Enable or disable agents for the worktree tool.")
    .action(async function (this: Command) {
      const flags = resolveCommandFlags(this);
      const logger = container.loggerFactory.create({
        scope: "configure:agents",
        dryRun: flags.dryRun,
        verbose: flags.verbose
      });

      const registry = createDefaultAgentRegistry();
      const manager = new AgentConfigManager({
        fs: container.fs,
        homeDir: container.env.homeDir,
        registry
      });
      await manager.loadConfig();

      const enabledEntries = await manager.getEnabledAgents();
      const enabledSet = new Set(enabledEntries.map((entry) => entry.id));

      const detectionResults = await Promise.all(
        registry.list().map(async (adapter) => {
          if (!adapter.detect) {
            logger.info(`${adapter.id}: available`);
            return { adapter, installed: true };
          }
          try {
            const installed = await adapter.detect({
              runCommand: container.commandRunner
            });
            logger.info(
              `${adapter.id}: ${installed ? "available" : "not detected"}`
            );
            return { adapter, installed };
          } catch (error) {
            const message =
              error instanceof Error ? error.message : String(error);
            logger.info(`${adapter.id}: not detected (${message})`);
            return { adapter, installed: false };
          }
        })
      );

      const promptResponse = await container.prompts({
        name: "agents",
        type: "multiselect",
        message: "Select agents to enable",
        choices: detectionResults.map(({ adapter, installed }) => ({
          title: installed
            ? `${adapter.label} (${adapter.id})`
            : `${adapter.label} (${adapter.id}) [not detected]`,
          value: adapter.id,
          selected: enabledSet.has(adapter.id)
        }))
      });

      const selectedValue = promptResponse?.agents;
      const selectedIds = Array.isArray(selectedValue)
        ? selectedValue.map((id) => String(id))
        : [];

      if (flags.dryRun) {
        logger.dryRun(
          `would enable agents: ${selectedIds.length > 0 ? selectedIds.join(", ") : "<none>"}`
        );
        return;
      }

      const selectedSet = new Set(selectedIds);
      for (const adapter of registry.list()) {
        await manager.updateAgent({
          id: adapter.id,
          enabled: selectedSet.has(adapter.id)
        });
      }

      logger.info("Updated agent configuration.");
    });
}
