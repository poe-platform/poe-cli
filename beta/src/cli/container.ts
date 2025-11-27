import {
  createCliContainer as createCoreContainer,
  type CliContainer as CoreContainer,
  type CliDependencies as CoreDependencies
} from "poe-code/dist/cli/container.js";
import type {
  ProviderService,
  ProviderContext
} from "poe-code/dist/cli/service-registry.js";
import type {
  ClaudeCodeSpawnOptions
} from "poe-code/dist/providers/claude-code.js";
import type {
  CodexSpawnOptions
} from "poe-code/dist/providers/codex.js";
import type {
  OpenCodeSpawnOptions
} from "poe-code/dist/providers/opencode.js";
import { createPoeApiClient, type PoeApiClient } from "../cli/api-client.js";
import type { ChatServiceFactory } from "./chat.js";
import { createAgentSession } from "../services/agent-session.js";
import { spawnClaudeCode } from "../services/claude-code.js";
import { spawnCodex } from "../services/codex.js";
import { spawnOpenCode } from "../services/opencode.js";

export type CliDependencies = CoreDependencies & {
  chatServiceFactory?: ChatServiceFactory;
};

export type CliContainer = CoreContainer & {
  readonly chatServiceFactory: ChatServiceFactory;
  readonly poeApiClient: PoeApiClient;
};

export function createCliContainer(
  dependencies: CliDependencies
): CliContainer {
  const base = createCoreContainer(dependencies);

  const chatServiceFactory =
    dependencies.chatServiceFactory ?? createAgentSession;

  const poeApiClient = createPoeApiClient(base.httpClient);

  overrideAgentSpawns(base.registry);

  return {
    ...base,
    chatServiceFactory,
    poeApiClient
  };
}

type SpawnContext<TPaths> = ProviderContext<TPaths> & {
  command: ProviderContext<TPaths>["command"];
};

function overrideAgentSpawns(registry: CoreContainer["registry"]): void {
  updateSpawn<ClaudeCodeSpawnOptions>(registry, "claude-code", async (context, options) => {
    return await spawnClaudeCode({
      prompt: options.prompt,
      args: options.args,
      runCommand: context.command.runCommand
    });
  });

  updateSpawn<CodexSpawnOptions>(registry, "codex", async (context, options) => {
    return await spawnCodex({
      prompt: options.prompt,
      args: options.args,
      runCommand: context.command.runCommand
    });
  });

  updateSpawn<OpenCodeSpawnOptions>(registry, "opencode", async (context, options) => {
    return await spawnOpenCode({
      prompt: options.prompt,
      args: options.args,
      runCommand: context.command.runCommand
    });
  });
}

function updateSpawn<TOptions>(
  registry: CoreContainer["registry"],
  serviceName: string,
  handler: (
    context: SpawnContext<Record<string, string>>,
    options: TOptions
  ) => Promise<unknown>
): void {
  const adapter = registry.get(serviceName) as
    | (ProviderService<Record<string, string>, unknown, unknown, TOptions> & {
        spawn?: (
          context: SpawnContext<Record<string, string>>,
          options: TOptions
        ) => Promise<unknown>;
      })
    | undefined;
  if (!adapter) {
    return;
  }
  adapter.spawn = handler;
}
