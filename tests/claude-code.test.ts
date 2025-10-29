import { describe, it, expect, beforeEach, vi } from "vitest";
import { Volume, createFsFromVolume } from "memfs";
import path from "node:path";
import type { FileSystem } from "../src/utils/file-system.js";
import {
  configureClaudeCode,
  removeClaudeCode,
  registerClaudeCodePrerequisites
} from "../src/services/claude-code.js";
import { createPrerequisiteManager } from "../src/utils/prerequisites.js";

function createMemFs(): { fs: FileSystem; vol: Volume } {
  const vol = new Volume();
  const fs = createFsFromVolume(vol);
  return { fs: fs.promises as unknown as FileSystem, vol };
}

describe("claude-code service", () => {
  let fs: FileSystem;
  let vol: Volume;
  const home = "/home/user";
  const settingsPath = path.join(home, ".claude", "settings.json");
  const keyHelperPath = path.join(home, ".claude", "anthropic_key.sh");
  const credentialsPath = path.join(home, ".poe-setup", "credentials.json");
  const apiKey = "sk-test";

  beforeEach(async () => {
    ({ fs, vol } = createMemFs());
    vol.mkdirSync(home, { recursive: true });
  });

  it("removeClaudeCode prunes manifest-managed env keys from settings json", async () => {
    await fs.mkdir(path.dirname(settingsPath), { recursive: true });
    await fs.writeFile(
      keyHelperPath,
      "#!/bin/bash\necho existing\n",
      { encoding: "utf8" }
    );
    await fs.writeFile(
      settingsPath,
      JSON.stringify(
        {
          apiKeyHelper: keyHelperPath,
          theme: "dark",
          env: {
            ANTHROPIC_BASE_URL: "https://api.poe.com",
            CUSTOM: "value"
          }
        },
        null,
        2
      ),
      { encoding: "utf8" }
    );

    const removed = await removeClaudeCode({ fs, settingsPath, keyHelperPath });
    expect(removed).toBe(true);

    const content = await fs.readFile(settingsPath, "utf8");
    const parsed = JSON.parse(content);
    expect(parsed).toEqual({
      theme: "dark",
      env: {
        CUSTOM: "value"
      }
    });
    await expect(fs.readFile(keyHelperPath, "utf8")).rejects.toThrow();
  });

  it("removeClaudeCode deletes settings file when only manifest keys remain", async () => {
    await fs.mkdir(path.dirname(settingsPath), { recursive: true });
    await fs.writeFile(
      keyHelperPath,
      "#!/bin/bash\necho existing\n",
      { encoding: "utf8" }
    );
    await fs.writeFile(
      settingsPath,
      JSON.stringify(
        {
          apiKeyHelper: keyHelperPath,
          env: {
            ANTHROPIC_BASE_URL: "https://api.poe.com"
          }
        },
        null,
        2
      ),
      { encoding: "utf8" }
    );

    const removed = await removeClaudeCode({ fs, settingsPath, keyHelperPath });
    expect(removed).toBe(true);

    await expect(fs.readFile(settingsPath, "utf8")).rejects.toThrow();
    await expect(fs.readFile(keyHelperPath, "utf8")).rejects.toThrow();
  });

  it("removeClaudeCode returns false when settings file absent", async () => {
    const removed = await removeClaudeCode({ fs, settingsPath, keyHelperPath });
    expect(removed).toBe(false);
  });

  it("creates settings json with claude env configuration", async () => {
    await configureClaudeCode({
      fs,
      apiKey,
      settingsPath,
      keyHelperPath,
      credentialsPath
    });

    const content = await fs.readFile(settingsPath, "utf8");
    const parsed = JSON.parse(content);
    expect(parsed).toEqual({
      apiKeyHelper: keyHelperPath,
      env: {
        ANTHROPIC_BASE_URL: "https://api.poe.com"
      }
    });
    const script = await fs.readFile(keyHelperPath, "utf8");
    expect(script).toBe(
      [
        "#!/bin/bash",
        'node -e "console.log(require(\'/home/user/.poe-setup/credentials.json\').apiKey)"'
      ].join("\n")
    );
  });

  it("merges existing settings json while preserving other keys", async () => {
    await fs.mkdir(path.dirname(settingsPath), { recursive: true });
    await fs.writeFile(
      settingsPath,
      JSON.stringify(
        {
          apiKeyHelper: "/existing/helper.sh",
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
      apiKey,
      settingsPath,
      keyHelperPath,
      credentialsPath
    });

    const content = await fs.readFile(settingsPath, "utf8");
    const parsed = JSON.parse(content);
    expect(parsed).toEqual({
      apiKeyHelper: keyHelperPath,
      theme: "dark",
      env: {
        ANTHROPIC_BASE_URL: "https://api.poe.com",
        CUSTOM: "value"
      }
    });
    const script = await fs.readFile(keyHelperPath, "utf8");
    expect(script).toBe(
      [
        "#!/bin/bash",
        'node -e "console.log(require(\'/home/user/.poe-setup/credentials.json\').apiKey)"'
      ].join("\n")
    );
  });

  it("registers prerequisite checks for the Claude CLI", async () => {
    const calls: Array<{ command: string; args: string[] }> = [];
    const runCommand = vi.fn(async (command: string, args: string[]) => {
      calls.push({ command, args });
      if (command === "which") {
        return { stdout: "/usr/bin/claude\n", stderr: "", exitCode: 0 };
      }
      if (command === "claude") {
        return { stdout: "CLAUDE_CODE_OK\n", stderr: "", exitCode: 0 };
      }
      return { stdout: "", stderr: "", exitCode: 0 };
    });
    const manager = createPrerequisiteManager({
      isDryRun: false,
      runCommand
    });

    registerClaudeCodePrerequisites(manager);
    await manager.run("before");
    await manager.run("after");

    expect(calls.map((entry) => entry.command)).toEqual(["which", "claude"]);
    expect(calls[0]).toEqual({ command: "which", args: ["claude"] });
    expect(calls[1]).toEqual({
      command: "claude",
      args: ["-p", "Output exactly: CLAUDE_CODE_OK", "--output-format", "text"]
    });
  });
});
