import { describe, it, expect, beforeEach } from "vitest";
import { Volume, createFsFromVolume } from "memfs";
import type { FileSystem } from "../src/utils/file-system.js";
import { AgentConfigManager } from "../src/services/agent-config-manager.js";
import { createDefaultAgentRegistry } from "../src/services/agent-registry.js";
import { getAvailableTools } from "../src/services/tools.js";

describe("getAvailableTools", () => {
  let fs: FileSystem;
  let vol: Volume;
  let manager: AgentConfigManager;
  const homeDir = "/home/user";

  beforeEach(async () => {
    vol = new Volume();
    vol.mkdirSync(homeDir, { recursive: true });
    const memfs = createFsFromVolume(vol);
    fs = memfs.promises as unknown as FileSystem;
    manager = new AgentConfigManager({
      fs,
      homeDir,
      registry: createDefaultAgentRegistry()
    });
    await manager.loadConfig();
  });

  it("uses the enabled agents for tool schema", async () => {
    const registry = createDefaultAgentRegistry();
    const tools = await getAvailableTools({
      agentConfigManager: manager,
      agentRegistry: registry
    });

    const worktreeTool = tools.find(
      (entry) => entry.type === "function" && entry.function?.name === "spawn_git_worktree"
    );
    expect(worktreeTool).toBeDefined();
    const enumValues = worktreeTool?.function?.parameters?.properties?.agent?.enum;
    expect(enumValues).toEqual(["claude-code", "codex", "opencode"]);
    expect(
      worktreeTool?.function?.parameters?.properties?.agent?.description
    ).toContain(
      "claude-code | codex | opencode"
    );
  });

  it("excludes disabled agents from tool schema", async () => {
    await manager.updateAgent({ id: "opencode", enabled: false });
    const registry = createDefaultAgentRegistry();
    const tools = await getAvailableTools({
      agentConfigManager: manager,
      agentRegistry: registry
    });

    const worktreeTool = tools.find(
      (entry) => entry.type === "function" && entry.function?.name === "spawn_git_worktree"
    );
    const enumValues = worktreeTool?.function?.parameters?.properties?.agent?.enum;
    expect(enumValues).toEqual(["claude-code", "codex"]);
    expect(
      worktreeTool?.function?.parameters?.properties?.agent?.description
    ).toContain("claude-code | codex");
    expect(
      worktreeTool?.function?.parameters?.properties?.agent?.description
    ).not.toContain("opencode");
  });
});
