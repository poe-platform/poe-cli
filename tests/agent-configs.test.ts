import { describe, it, expect, beforeEach } from "vitest";
import { Volume, createFsFromVolume } from "memfs";
import path from "node:path";
import type { FileSystem } from "../src/utils/file-system.js";
import { createCliEnvironment } from "../src/cli/environment.js";
import {
  generateAgentConfigs,
  resolveServicePaths,
  resolveServicePathsFromHome,
  hasAgentConfig
} from "../src/services/agent-configs.js";

function createMemFs(homeDir: string): FileSystem {
  const volume = new Volume();
  volume.mkdirSync(homeDir, { recursive: true });
  return createFsFromVolume(volume).promises as unknown as FileSystem;
}

describe("agent configs", () => {
  const homeDir = "/home/test";
  let fs: FileSystem;

  beforeEach(() => {
    fs = createMemFs(homeDir);
  });

  it("writes configs for all services", async () => {
    const env = createCliEnvironment({ cwd: homeDir, homeDir });
    await generateAgentConfigs({ fs, env, apiKey: "test-key" });

    const claudePaths = resolveServicePaths("claude-code", env);
    const claudeSettings = JSON.parse(
      await fs.readFile(claudePaths.files.settings, "utf8")
    );
    expect(claudeSettings.apiKeyHelper).toBe(claudePaths.files.script);

    const codexPaths = resolveServicePaths("codex", env);
    const codexConfig = await fs.readFile(codexPaths.files.config, "utf8");
    expect(codexConfig).toContain("model = \"GPT-5.1-Codex\"");

    const opencodePaths = resolveServicePaths("opencode", env);
    const opencodeAuth = JSON.parse(
      await fs.readFile(opencodePaths.files.auth, "utf8")
    );
    expect(opencodeAuth.poe.key).toBe("test-key");

    const kimiPaths = resolveServicePaths("kimi", env);
    const kimiConfig = JSON.parse(
      await fs.readFile(kimiPaths.files.config, "utf8")
    );
    expect(kimiConfig.providers.poe.api_key).toBe("test-key");
  });

  it("detects existing configs via hasAgentConfig", async () => {
    const env = createCliEnvironment({ cwd: homeDir, homeDir });
    expect(
      await hasAgentConfig({ fs, env, service: "claude-code" })
    ).toBe(false);

    await generateAgentConfigs({ fs, env, apiKey: "key" });

    expect(
      await hasAgentConfig({ fs, env, service: "claude-code" })
    ).toBe(true);
  });

  it("resolves service paths from custom home", () => {
    const layout = resolveServicePathsFromHome("codex", "/custom");
    expect(layout.files.config).toBe(
      path.join("/custom", ".poe-code", "codex", ".codex", "config.toml")
    );
  });
});
