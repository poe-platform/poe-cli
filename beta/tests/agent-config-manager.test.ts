import { describe, it, expect, beforeEach } from "vitest";
import { Volume, createFsFromVolume } from "memfs";
import type { FileSystem } from "../src/utils/file-system.js";

import { AgentConfigManager } from "../src/services/agent-config-manager.js";
import { createDefaultAgentRegistry } from "../src/services/agent-registry.js";

describe("AgentConfigManager", () => {
  let fs: FileSystem;
  let vol: Volume;
  const homeDir = "/home/user";

  beforeEach(() => {
    vol = new Volume();
    vol.mkdirSync(homeDir, { recursive: true });
    const memfs = createFsFromVolume(vol);
    fs = memfs.promises as unknown as FileSystem;
  });

  it("creates a default configuration when missing", async () => {
    const registry = createDefaultAgentRegistry();
    const manager = new AgentConfigManager({ fs, homeDir, registry });

    const config = await manager.loadConfig();

    const filePath = `${homeDir}/.poe-code/agent-config.json`;
    const written = JSON.parse(vol.readFileSync(filePath, "utf8"));

    expect(config.agents).toEqual(written.agents);
    const enabled = written.agents
      .filter((entry: { enabled: boolean }) => entry.enabled)
      .map((entry: { id: string }) => entry.id);
    expect(enabled).toEqual(["claude-code", "codex", "opencode"]);
    expect(written.$schema).toMatch(/agent-config\.schema\.json$/);
  });

  it("returns enabled agent entries", async () => {
    const registry = createDefaultAgentRegistry();
    const manager = new AgentConfigManager({ fs, homeDir, registry });

    const enabled = await manager.getEnabledAgents();

    expect(enabled.map((entry) => entry.id)).toEqual([
      "claude-code",
      "codex",
      "opencode"
    ]);
  });

  it("updates agent enablement state and persists it", async () => {
    const registry = createDefaultAgentRegistry();
    const manager = new AgentConfigManager({ fs, homeDir, registry });
    await manager.loadConfig();

    await manager.updateAgent({ id: "poe-code", enabled: true });
    const enabled = await manager.getEnabledAgents();

    expect(enabled.map((entry) => entry.id)).toContain("poe-code");

    const stored = JSON.parse(
      vol.readFileSync(`${homeDir}/.poe-code/agent-config.json`, "utf8")
    );
    const record = stored.agents.find(
      (entry: { id: string }) => entry.id === "poe-code"
    );
    expect(record.enabled).toBe(true);
  });

  it("adds missing registry agents to existing configuration", async () => {
    const registry = createDefaultAgentRegistry();
    const filePath = `${homeDir}/.poe-code/agent-config.json`;
    vol.mkdirSync(`${homeDir}/.poe-code`, { recursive: true });
    vol.writeFileSync(
      filePath,
      JSON.stringify(
        {
          agents: [
            { id: "codex", enabled: true },
            { id: "claude-code", enabled: true }
          ]
        },
        null,
        2
      ),
      "utf8"
    );

    const manager = new AgentConfigManager({ fs, homeDir, registry });
    const config = await manager.loadConfig();

    const ids = config.agents.map((entry) => entry.id);
    expect(ids).toEqual([
      "claude-code",
      "codex",
      "opencode",
      "poe-code"
    ]);
  });
});
