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

  it("restores from backup on remove", async () => {
    await configureClaudeCode({
      fs,
      bashrcPath,
      apiKey,
      timestamp: () => "20240101T000000"
    });
    await fs.writeFile(bashrcPath, "# overwritten", { encoding: "utf8" });

    const removed = await removeClaudeCode({ fs, bashrcPath });
    expect(removed).toBe(true);

    const content = await fs.readFile(bashrcPath, "utf8");
    expect(content).toBe("# existing config");
  });

  it("removes configuration block when backup missing", async () => {
    await configureClaudeCode({
      fs,
      bashrcPath,
      apiKey,
      timestamp: () => "20240101T000000"
    });
    await fs.unlink(`${bashrcPath}.backup.20240101T000000`);

    const removed = await removeClaudeCode({ fs, bashrcPath });
    expect(removed).toBe(true);

    const content = await fs.readFile(bashrcPath, "utf8");
    expect(content).toBe("# existing config");
  });
});
