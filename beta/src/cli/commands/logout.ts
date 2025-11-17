import type { Command } from "commander";
import type { CliContainer } from "../container.js";
import {
  createExecutionResources,
  resolveCommandFlags
} from "./shared.js";
import {
  deleteCredentials,
  loadCredentials
} from "../../services/credentials.js";

export function registerLogoutCommand(
  program: Command,
  container: CliContainer
): void {
  program
    .command("logout")
    .description("Remove the stored Poe API key.")
    .action(async () => {
      const flags = resolveCommandFlags(program);
      const resources = createExecutionResources(
        container,
        flags,
        "logout"
      );

      const stored = await loadCredentials({
        fs: container.fs,
        filePath: container.env.credentialsPath
      });

      if (!stored) {
        resources.context.complete({
          success: "No stored Poe API key found.",
          dry: "Dry run: no stored Poe API key to remove."
        });
        return;
      }

      await deleteCredentials({
        fs: resources.context.fs,
        filePath: container.env.credentialsPath
      });

      resources.context.complete({
        success: "Removed stored Poe API key.",
        dry: "Dry run: would remove stored Poe API key."
      });
    });
}
