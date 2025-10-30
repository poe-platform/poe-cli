import type { Command } from "commander";
import type { CliContainer } from "../container.js";
import { initProject } from "../../commands/init.js";
import {
  createExecutionResources,
  resolveCommandFlags
} from "./shared.js";
import { DEFAULT_MODEL } from "../constants.js";

export interface InitCommandOptions {
  projectName?: string;
  apiKey?: string;
  model?: string;
}

export function registerInitCommand(
  program: Command,
  container: CliContainer
): void {
  program
    .command("init")
    .description("Initialize a Python project preconfigured for Poe API.")
    .option("--project-name <name>", "Project directory name")
    .option("--api-key <key>", "Poe API key")
    .option("--model <model>", "Model identifier")
    .action(async (options: InitCommandOptions) => {
      const flags = resolveCommandFlags(program);
      const resources = createExecutionResources(
        container,
        flags,
        "init"
      );

      const projectName =
        options.projectName ?? (await promptForProjectName(container));

      const apiKey = await container.options.resolveApiKey({
        value: options.apiKey,
        dryRun: flags.dryRun
      });

      const model = await container.options.resolveModel(
        options.model,
        DEFAULT_MODEL
      );

      await initProject({
        fs: resources.context.fs,
        cwd: container.env.cwd,
        projectName,
        apiKey,
        model
      });

      resources.context.complete({
        success: `Initialized project "${projectName}".`,
        dry: `Dry run: would initialize project "${projectName}".`
      });
    });
}

async function promptForProjectName(
  container: CliContainer
): Promise<string> {
  const response = await container.prompts({
    type: "text",
    name: "projectName",
    message: "Project name"
  });
  const value = response.projectName;
  if (!value || typeof value !== "string") {
    throw new Error("Project name is required.");
  }
  return value;
}
