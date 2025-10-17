import { describe, it, expect, beforeEach } from "vitest";
import { Volume, createFsFromVolume } from "memfs";
import path from "node:path";
import type { FileSystem } from "../src/utils/file-system.js";
import {
  configureCodex,
  removeCodex
} from "../src/services/codex.js";

function createMemFs(): { fs: FileSystem; vol: Volume } {
  const vol = new Volume();
  const fs = createFsFromVolume(vol);
  return { fs: fs.promises as unknown as FileSystem, vol };
}

describe("codex service", () => {
  let fs: FileSystem;
  let vol: Volume;
  const home = "/home/user";
  const configDir = path.join(home, ".codex");
  const configPath = path.join(configDir, "config.toml");

  beforeEach(async () => {
    ({ fs, vol } = createMemFs());
    vol.mkdirSync(home, { recursive: true });
  });

  it("writes codex config from template", async () => {
    await configureCodex({
      fs,
      configPath,
      model: "gpt-5",
      reasoningEffort: "medium",
      timestamp: () => "20240101T000000"
    });

    const content = await fs.readFile(configPath, "utf8");
    expect(content.trim()).toContain('model = "gpt-5"');
    expect(content.trim()).toContain('model_reasoning_effort = "medium"');

    await expect(
      fs.readFile(`${configPath}.backup.20240101T000000`, "utf8")
    ).rejects.toThrow();
  });

  it("removes generated config without restoring backup", async () => {
    await fs.mkdir(configDir, { recursive: true });
    await fs.writeFile(configPath, "original", { encoding: "utf8" });

    await configureCodex({
      fs,
      configPath,
      model: "gpt-5",
      reasoningEffort: "medium",
      timestamp: () => "20240101T000000"
    });

    await fs.writeFile(
      `${configPath}.backup.20240101T000000`,
      "legacy",
      { encoding: "utf8" }
    );
    const removed = await removeCodex({ fs, configPath });
    expect(removed).toBe(true);

    await expect(fs.readFile(configPath, "utf8")).rejects.toThrow();
  });

  it("deletes config when content matches template", async () => {
    await configureCodex({
      fs,
      configPath,
      model: "gpt-5",
      reasoningEffort: "medium",
      timestamp: () => "20240101T000000"
    });

    const removed = await removeCodex({ fs, configPath });
    expect(removed).toBe(true);

    await expect(fs.readFile(configPath, "utf8")).rejects.toThrow();
  });

  it("keeps config when file differs from template", async () => {
    await fs.mkdir(configDir, { recursive: true });
    await fs.writeFile(configPath, 'model = "custom"', {
      encoding: "utf8"
    });

    const removed = await removeCodex({ fs, configPath });
    expect(removed).toBe(false);

    const content = await fs.readFile(configPath, "utf8");
    expect(content).toBe('model = "custom"');
  });
});
