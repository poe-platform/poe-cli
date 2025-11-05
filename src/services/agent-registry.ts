import { spawnCodex } from "./codex.js";
import { spawnClaudeCode } from "./claude-code.js";
import { spawnOpenCode } from "./opencode.js";
import { spawnPoeCode } from "./poe-code.js";
import type {
  CommandRunner,
  CommandRunnerResult
} from "../utils/prerequisites.js";

export interface AgentSpawnOptions {
  prompt: string;
  args: string[];
  runCommand: CommandRunner;
}

export interface AgentDetectionContext {
  runCommand: CommandRunner;
}

export interface AgentAdapter {
  id: string;
  label: string;
  spawn: (options: AgentSpawnOptions) => Promise<CommandRunnerResult>;
  detect?: (context: AgentDetectionContext) => Promise<boolean>;
  defaultEnabled?: boolean;
  description?: string;
}

export class AgentRegistry {
  private readonly adapters = new Map<string, AgentAdapter>();

  constructor(initialAdapters: AgentAdapter[] = []) {
    for (const adapter of initialAdapters) {
      this.register(adapter);
    }
  }

  register(adapter: AgentAdapter): void {
    this.adapters.set(adapter.id, adapter);
  }

  get(id: string): AgentAdapter | undefined {
    return this.adapters.get(id);
  }

  has(id: string): boolean {
    return this.adapters.has(id);
  }

  list(): AgentAdapter[] {
    return Array.from(this.adapters.values());
  }
}

export const LEGACY_DEFAULT_AGENTS = [
  "claude-code",
  "codex",
  "opencode"
] as const;

export function createDefaultAgentRegistry(): AgentRegistry {
  const registry = new AgentRegistry();

  registry.register({
    id: "claude-code",
    label: "Claude Code",
    spawn: async (options) =>
      await spawnClaudeCode({
        prompt: options.prompt,
        args: options.args,
        runCommand: options.runCommand
      }),
    detect: createBinaryDetector("claude"),
    defaultEnabled: true
  });

  registry.register({
    id: "codex",
    label: "Codex CLI",
    spawn: async (options) =>
      await spawnCodex({
        prompt: options.prompt,
        args: options.args,
        runCommand: options.runCommand
      }),
    detect: createBinaryDetector("codex"),
    defaultEnabled: true
  });

  registry.register({
    id: "opencode",
    label: "OpenCode CLI",
    spawn: async (options) =>
      await spawnOpenCode({
        prompt: options.prompt,
        args: options.args,
        runCommand: options.runCommand
      }),
    detect: createBinaryDetector("opencode"),
    defaultEnabled: true
  });

  registry.register({
    id: "poe-code",
    label: "Poe Code",
    spawn: async (options) =>
      await spawnPoeCode({
        prompt: options.prompt,
        args: options.args,
        runCommand: options.runCommand
      }),
    detect: async () => true,
    defaultEnabled: false
  });

  return registry;
}

function createBinaryDetector(command: string) {
  return async ({ runCommand }: AgentDetectionContext): Promise<boolean> => {
    try {
      const result = await runCommand(command, ["--version"]);
      return result.exitCode === 0;
    } catch {
      return false;
    }
  };
}

