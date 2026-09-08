import type { CommandDefinition } from "../contracts/index.js";
import { RegexExecutor } from "../commands/regex-execution/client.js";
import { commandExecutor, composeAgentCommands, type AgentCommandsOptions } from "./composition.js";
import type { VirtualShellPlugin } from "../contracts/index.js";

export type { AgentCommandsOptions } from "./composition.js";

export function createAgentCommands(options: AgentCommandsOptions = {}): readonly CommandDefinition[] {
  return composeAgentCommands(options, {
    grep: new RegexExecutor(options.regex),
    aliases: new RegexExecutor(options.regex),
    expr: new RegexExecutor(options.regex),
    search: new RegexExecutor(options.search?.regex),
  });
}

export function agentCommands(options: AgentCommandsOptions = {}): VirtualShellPlugin {
  return {
    name: "agent-commands",
    setup(host) {
      const definitions = createAgentCommands({ ...options, execute: options.execute ?? commandExecutor(name => host.commands.get(name)) });
      if (!options.replace) for (const definition of definitions) {
        if (host.commands.has(definition.name)) throw new Error(`Command already registered: ${definition.name}`);
      }
      for (const definition of definitions) host.commands.register(definition, { replace: options.replace ?? false });
    },
  };
}
