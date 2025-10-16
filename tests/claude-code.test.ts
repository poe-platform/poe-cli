import { describe, it, expect, beforeEach } from "vitest";
import { Volume, createFsFromVolume } from "memfs";
import path from "node:path";
import type { FileSystem } from "../src/utils/file-system.js";
import {
  configureClaudeCode,
  removeClaudeCode
} from "../src/services/claude-code.js";

function createMemFs(): { fs: FileSystem; vol: Volume } {
  const vol = new Volume();
  const fs = createFsFromVolume(vol);
  return { fs: fs.promises as unknown as FileSystem, vol };
}

describe("claude-code service", () => {
  let fs: FileSystem;
  let vol: Volume;
  const home = "/home/user";
  const bashrcPath = path.join(home, ".bashrc");
  const settingsPath = path.join(home, ".claude", "settings.json");
  const apiKey = "sk-test";
  const templateOutput =
    'export POE_API_KEY="sk-test"\n' +
    "export ANTHROPIC_API_KEY=$POE_API_KEY\n" +
    'export ANTHROPIC_BASE_URL="https://api.poe.com"';

  beforeEach(async () => {
    ({ fs, vol } = createMemFs());
    vol.mkdirSync(home, { recursive: true });
    await fs.writeFile(bashrcPath, "# existing config", { encoding: "utf8" });
  });

  it("appends configuration block and creates backup", async () => {
    await configureClaudeCode({
      fs,
      bashrcPath,
      apiKey,
      settingsPath,
      timestamp: () => "20240101T000000"
    });

    const content = await fs.readFile(bashrcPath, "utf8");
    expect(content.trimEnd()).toBe(`# existing config\n\n${templateOutput}`);

    const backup = await fs.readFile(
      `${bashrcPath}.backup.20240101T000000`,
      "utf8"
    );
    expect(backup).toBe("# existing config");
  });

  it("removes configuration block without restoring from backup", async () => {
    await configureClaudeCode({
      fs,
      bashrcPath,
      apiKey,
      settingsPath,
      timestamp: () => "20240101T000000"
    });
    await fs.writeFile(
      `${bashrcPath}.backup.20240101T000000`,
      "# backup",
      { encoding: "utf8" }
    );
    await fs.writeFile(
      bashrcPath,
      "# overwritten\n\n" + templateOutput,
      {
        encoding: "utf8"
      }
    );

    const removed = await removeClaudeCode({ fs, bashrcPath });
    expect(removed).toBe(true);

    const content = await fs.readFile(bashrcPath, "utf8");
    expect(content).toBe("# overwritten");
  });

  it("removes configuration block when backup missing", async () => {
    await configureClaudeCode({
      fs,
      bashrcPath,
      apiKey,
      settingsPath,
      timestamp: () => "20240101T000000"
    });
    await fs.unlink(`${bashrcPath}.backup.20240101T000000`);

    const removed = await removeClaudeCode({ fs, bashrcPath });
    expect(removed).toBe(true);

    const content = await fs.readFile(bashrcPath, "utf8");
    expect(content).toBe("# existing config");
  });

  it("returns false when configuration block not present", async () => {
    await fs.writeFile(bashrcPath, "# custom config", { encoding: "utf8" });

    const removed = await removeClaudeCode({ fs, bashrcPath });
    expect(removed).toBe(false);

    const content = await fs.readFile(bashrcPath, "utf8");
    expect(content).toBe("# custom config");
  });

  it("creates settings json with claude env configuration", async () => {
    await configureClaudeCode({
      fs,
      bashrcPath,
      apiKey,
      settingsPath
    });

    const content = await fs.readFile(settingsPath, "utf8");
    const parsed = JSON.parse(content);
    expect(parsed).toEqual({
      env: {
        ANTHROPIC_BASE_URL: "https://api.poe.com",
        ANTHROPIC_API_KEY: apiKey
      }
    });
  });

  it("merges existing settings json while preserving other keys", async () => {
    await fs.mkdir(path.dirname(settingsPath), { recursive: true });
    await fs.writeFile(
      settingsPath,
      JSON.stringify(
        {
          theme: "dark",
          env: {
            ANTHROPIC_BASE_URL: "https://custom.example.com",
            CUSTOM: "value"
          }
        },
        null,
        2
      ),
      { encoding: "utf8" }
    );

    await configureClaudeCode({
      fs,
      bashrcPath,
      apiKey,
      settingsPath
    });

    const content = await fs.readFile(settingsPath, "utf8");
    const parsed = JSON.parse(content);
    expect(parsed).toEqual({
      theme: "dark",
      env: {
        ANTHROPIC_BASE_URL: "https://api.poe.com",
        ANTHROPIC_API_KEY: apiKey,
        CUSTOM: "value"
      }
    });
  });
});
