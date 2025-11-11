import path from "node:path";
import type { FileSystem } from "../utils/file-system.js";
import {
  AgentRegistry,
  LEGACY_DEFAULT_AGENTS
} from "./agent-registry.js";

export interface AgentConfigEntry {
  id: string;
  enabled: boolean;
}

export interface AgentConfig {
  $schema?: string;
  agents: AgentConfigEntry[];
}

interface AgentConfigManagerInit {
  fs: FileSystem;
  homeDir: string;
  registry: AgentRegistry;
}

const CONFIG_SCHEMA_URL =
  "https://poe.com/schemas/agent-config.schema.json";

export class AgentConfigManager {
  private readonly fs: FileSystem;
  private readonly registry: AgentRegistry;
  private readonly homeDir: string;
  private readonly configPath: string;
  private cachedConfig: AgentConfig | null = null;

  constructor(init: AgentConfigManagerInit) {
    this.fs = init.fs;
    this.registry = init.registry;
    this.homeDir = init.homeDir;
    this.configPath = path.join(this.homeDir, ".poe-code", "agent-config.json");
  }

  getConfigPath(): string {
    return this.configPath;
  }

  async loadConfig(): Promise<AgentConfig> {
    if (this.cachedConfig) {
      return cloneConfig(this.cachedConfig);
    }

    const existing = await this.readConfig();
    const merged = this.mergeWithRegistry(existing);

    if (!existing || !configsEqual(existing, merged)) {
      await this.writeConfig(merged);
    }

    this.cachedConfig = merged;
    return cloneConfig(merged);
  }

  async getEnabledAgents(): Promise<AgentConfigEntry[]> {
    const config = await this.loadConfig();
    return config.agents
      .filter((entry) => entry.enabled)
      .map((entry) => ({ ...entry }));
  }

  async updateAgent(update: AgentConfigEntry): Promise<void> {
    const config = await this.loadConfig();
    const adapter = this.registry.get(update.id);
    if (!adapter) {
      throw new Error(`Unknown agent "${update.id}".`);
    }

    const target = config.agents.find((entry) => entry.id === update.id);
    if (!target) {
      throw new Error(`Agent "${update.id}" is not present in configuration.`);
    }

    if (target.enabled === update.enabled) {
      return;
    }

    target.enabled = update.enabled;
    await this.writeConfig(config);
    this.cachedConfig = config;
  }

  private async readConfig(): Promise<AgentConfig | null> {
    try {
      const content = await this.fs.readFile(this.configPath, "utf8");
      const parsed = JSON.parse(content) as Partial<AgentConfig>;
      if (!Array.isArray(parsed.agents)) {
        return null;
      }
      const agents = parsed.agents
        .filter((entry) => entry && typeof entry.id === "string")
        .map((entry) => ({
          id: entry.id,
          enabled: Boolean(entry.enabled)
        }));
      const sanitized: AgentConfig = {
        $schema:
          typeof parsed.$schema === "string"
            ? parsed.$schema
            : undefined,
        agents
      };
      return sanitized;
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        (error as { code?: string }).code === "ENOENT"
      ) {
        return null;
      }
      return null;
    }
  }

  private mergeWithRegistry(existing: AgentConfig | null): AgentConfig {
    const existingMap = new Map<string, boolean>();
    if (existing) {
      for (const entry of existing.agents) {
        if (typeof entry.id === "string") {
          existingMap.set(entry.id, Boolean(entry.enabled));
        }
      }
    }

    const agents = this.registry.list().map((adapter) => {
      const current = existingMap.get(adapter.id);
      const enabled =
        current !== undefined
          ? current
          : adapter.defaultEnabled ??
            LEGACY_DEFAULT_AGENTS.some((legacy) => legacy === adapter.id);
      return { id: adapter.id, enabled };
    });

    return {
      $schema: CONFIG_SCHEMA_URL,
      agents
    };
  }

  private async writeConfig(config: AgentConfig): Promise<void> {
    await this.ensureDirectory();
    const serialized = serializeConfig(config);
    await this.fs.writeFile(this.configPath, serialized, { encoding: "utf8" });
  }

  private async ensureDirectory(): Promise<void> {
    const dir = path.dirname(this.configPath);
    try {
      await this.fs.stat(dir);
    } catch {
      await this.fs.mkdir(dir, { recursive: true });
    }
  }
}

function cloneConfig(config: AgentConfig): AgentConfig {
  return {
    $schema: config.$schema,
    agents: config.agents.map((entry) => ({ ...entry }))
  };
}

function serializeConfig(config: AgentConfig): string {
  return JSON.stringify(config, null, 2);
}

function configsEqual(a: AgentConfig, b: AgentConfig): boolean {
  return serializeConfig(a) === serializeConfig(b);
}
