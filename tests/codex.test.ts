import { describe, it, expect, beforeEach } from "vitest";
import { Volume, createFsFromVolume } from "memfs";
import path from "node:path";
import type { FileSystem } from "../src/utils/file-system";
import {
  configureCodex,
  removeCodex
} from "../src/services/codex";

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

  it("restores backup on remove", async () => {
    await fs.mkdir(configDir, { recursive: true });
    await fs.writeFile(configPath, "original", { encoding: "utf8" });

    await configureCodex({
      fs,
      configPath,
      model: "gpt-5",
      reasoningEffort: "medium",
      timestamp: () => "20240101T000000"
    });

    const backup = await fs.readFile(
      `${configPath}.backup.20240101T000000`,
      "utf8"
    );
    expect(backup).toBe("original");

    await fs.writeFile(configPath, "modified", { encoding: "utf8" });
    const removed = await removeCodex({ fs, configPath });
    expect(removed).toBe(true);

    const content = await fs.readFile(configPath, "utf8");
    expect(content).toBe("original");
  });

  it("deletes config when no backup exists", async () => {
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
});
