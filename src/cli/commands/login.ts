import type { Command } from "commander";
import type { CliContainer } from "../container.js";
import {
  createExecutionResources,
  resolveCommandFlags
} from "./shared.js";
import { saveCredentials } from "../../services/credentials.js";

export interface LoginCommandOptions {
  apiKey?: string;
}

export function registerLoginCommand(
  program: Command,
  container: CliContainer
): void {
  program
    .command("login")
    .description("Store a Poe API key for reuse across commands.")
    .option("--api-key <key>", "Poe API key")
    .action(async (options: LoginCommandOptions) => {
      const flags = resolveCommandFlags(program);
      const resources = createExecutionResources(
        container,
        flags,
        "login"
      );

      const apiKey = await resolveApiKeyInput(container, options);
      const normalized = container.options.normalizeApiKey(apiKey);

      await saveCredentials({
        fs: resources.context.fs,
        filePath: container.env.credentialsPath,
        apiKey: normalized
      });

      resources.context.complete({
        success: `Poe API key stored at ${container.env.credentialsPath}.`,
        dry: `Dry run: would store Poe API key at ${container.env.credentialsPath}.`
      });
    });
}

async function resolveApiKeyInput(
  container: CliContainer,
  options: LoginCommandOptions
): Promise<string> {
  if (options.apiKey) {
    return options.apiKey;
  }
  const descriptor = container.promptLibrary.loginApiKey();
  const response = await container.prompts(descriptor);
  const result = response[descriptor.name];
  if (!result || typeof result !== "string") {
    throw new Error("POE API key is required.");
  }
  return result;
}
