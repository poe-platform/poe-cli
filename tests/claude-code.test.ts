import { describe, it, expect, beforeEach, vi } from "vitest";
import { Volume, createFsFromVolume } from "memfs";
import path from "node:path";
import type { FileSystem } from "../src/utils/file-system.js";
import * as claudeService from "../src/providers/claude-code.js";
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
  const credentialsPath = path.join(home, ".poe-code", "credentials.json");
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
            ANTHROPIC_DEFAULT_HAIKU_MODEL: "Claude-Haiku-4.5",
            ANTHROPIC_DEFAULT_SONNET_MODEL: "Claude-Sonnet-4.5",
            ANTHROPIC_DEFAULT_OPUS_MODEL: "Claude-Opus-4.1",
            CUSTOM: "value"
          },
          model: "Claude-Sonnet-4.5",
          customField: "should-remain"
        },
        null,
        2
      ),
      { encoding: "utf8" }
    );

    const removed = await claudeService.removeClaudeCode({
      fs,
      settingsPath,
      keyHelperPath
    });
    expect(removed).toBe(true);

    const content = await fs.readFile(settingsPath, "utf8");
    const parsed = JSON.parse(content);
    expect(parsed).toEqual({
      theme: "dark",
      env: {
        CUSTOM: "value"
      },
      customField: "should-remain"
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
            ANTHROPIC_BASE_URL: "https://api.poe.com",
            ANTHROPIC_DEFAULT_HAIKU_MODEL: "Claude-Haiku-4.5",
            ANTHROPIC_DEFAULT_SONNET_MODEL: "Claude-Sonnet-4.5",
            ANTHROPIC_DEFAULT_OPUS_MODEL: "Claude-Opus-4.1"
          },
          model: "Claude-Sonnet-4.5"
        },
        null,
        2
      ),
      { encoding: "utf8" }
    );

    const removed = await claudeService.removeClaudeCode({
      fs,
      settingsPath,
      keyHelperPath
    });
    expect(removed).toBe(true);

    await expect(fs.readFile(settingsPath, "utf8")).rejects.toThrow();
    await expect(fs.readFile(keyHelperPath, "utf8")).rejects.toThrow();
  });

  it("removeClaudeCode returns false when settings file absent", async () => {
    const removed = await claudeService.removeClaudeCode({
      fs,
      settingsPath,
      keyHelperPath
    });
    expect(removed).toBe(false);
  });

  it("creates settings json with claude env configuration", async () => {
    await claudeService.configureClaudeCode({
      fs,
      apiKey,
      settingsPath,
      keyHelperPath,
      credentialsPath,
      defaultModel: "Claude-Sonnet-4.5"
    });

    const content = await fs.readFile(settingsPath, "utf8");
    const parsed = JSON.parse(content);
    expect(parsed).toEqual({
      apiKeyHelper: keyHelperPath,
      env: {
        ANTHROPIC_BASE_URL: "https://api.poe.com",
        ANTHROPIC_DEFAULT_HAIKU_MODEL: "Claude-Haiku-4.5",
        ANTHROPIC_DEFAULT_SONNET_MODEL: "Claude-Sonnet-4.5",
        ANTHROPIC_DEFAULT_OPUS_MODEL: "Claude-Opus-4.1"
      },
      model: "Claude-Sonnet-4.5"
    });
    const script = await fs.readFile(keyHelperPath, "utf8");
    expect(script).toBe(
      [
        "#!/bin/bash",
        'node -e "console.log(require(\'/home/user/.poe-code/credentials.json\').apiKey)"'
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

    await claudeService.configureClaudeCode({
      fs,
      apiKey,
      settingsPath,
      keyHelperPath,
      credentialsPath,
      defaultModel: "Claude-Sonnet-4.5"
    });

    const content = await fs.readFile(settingsPath, "utf8");
    const parsed = JSON.parse(content);
    expect(parsed).toEqual({
      apiKeyHelper: keyHelperPath,
      theme: "dark",
      env: {
        ANTHROPIC_BASE_URL: "https://api.poe.com",
        ANTHROPIC_DEFAULT_HAIKU_MODEL: "Claude-Haiku-4.5",
        ANTHROPIC_DEFAULT_SONNET_MODEL: "Claude-Sonnet-4.5",
        ANTHROPIC_DEFAULT_OPUS_MODEL: "Claude-Opus-4.1",
        CUSTOM: "value"
      },
      model: "Claude-Sonnet-4.5"
    });
    const script = await fs.readFile(keyHelperPath, "utf8");
    expect(script).toBe(
      [
        "#!/bin/bash",
        'node -e "console.log(require(\'/home/user/.poe-code/credentials.json\').apiKey)"'
      ].join("\n")
    );
  });

  it("recovers when settings json contains invalid content", async () => {
    const dir = path.dirname(settingsPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(settingsPath, "test\n", { encoding: "utf8" });

    await claudeService.configureClaudeCode({
      fs,
      apiKey,
      settingsPath,
      keyHelperPath,
      credentialsPath,
      defaultModel: "Claude-Sonnet-4.5"
    });

    const files = await fs.readdir(dir);
    const backupName = files.find((name) =>
      name.startsWith("settings.json.invalid-")
    );
    expect(backupName).toBeDefined();
    const backupPath = path.join(dir, backupName as string);
    const backupContent = await fs.readFile(backupPath, "utf8");
    expect(backupContent).toBe("test\n");

    const settings = await fs.readFile(settingsPath, "utf8");
    const parsed = JSON.parse(settings);
    expect(parsed).toEqual({
      apiKeyHelper: keyHelperPath,
      env: {
        ANTHROPIC_BASE_URL: "https://api.poe.com",
        ANTHROPIC_DEFAULT_HAIKU_MODEL: "Claude-Haiku-4.5",
        ANTHROPIC_DEFAULT_SONNET_MODEL: "Claude-Sonnet-4.5",
        ANTHROPIC_DEFAULT_OPUS_MODEL: "Claude-Opus-4.1"
      },
      model: "Claude-Sonnet-4.5"
    });
    const script = await fs.readFile(keyHelperPath, "utf8");
    expect(script).toBe(
      [
        "#!/bin/bash",
        'node -e "console.log(require(\'/home/user/.poe-code/credentials.json\').apiKey)"'
      ].join("\n")
    );
  });

  it("creates settings with custom defaultModel value", async () => {
    await claudeService.configureClaudeCode({
      fs,
      apiKey,
      settingsPath,
      keyHelperPath,
      credentialsPath,
      defaultModel: "Claude-Haiku-4.5"
    });

    const content = await fs.readFile(settingsPath, "utf8");
    const parsed = JSON.parse(content);
    expect(parsed.model).toBe("Claude-Haiku-4.5");
    // Environment variables remain the same (not dynamically changed)
    expect(parsed.env.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe("Claude-Haiku-4.5");
    expect(parsed.env.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe("Claude-Sonnet-4.5");
    expect(parsed.env.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe("Claude-Opus-4.1");
  });

  it("spawns the claude CLI with the provided prompt and args", async () => {
    const runCommand = vi.fn(async () => ({
      stdout: "hello\n",
      stderr: "",
      exitCode: 0
    }));

    const result = await claudeService.spawnClaudeCode({
      prompt: "Test prompt",
      args: ["--custom-arg", "value"],
      runCommand
    });

    expect(runCommand).toHaveBeenCalledWith("claude", [
      "-p",
      "Test prompt",
      "--allowedTools",
      "Bash,Read",
      "--permission-mode",
      "acceptEdits",
      "--output-format",
      "text",
      "--custom-arg",
      "value"
    ]);
    expect(result).toEqual({
      stdout: "hello\n",
      stderr: "",
      exitCode: 0
    });
  });

  it("registers prerequisite checks for the Claude CLI", async () => {
    const calls: Array<{ command: string; args: string[] }> = [];
    const runCommand = vi.fn(async (command: string, args: string[]) => {
      calls.push({ command, args });
      if (command === "claude") {
        return { stdout: "CLAUDE_CODE_OK\n", stderr: "", exitCode: 0 };
      }
      return { stdout: "", stderr: "", exitCode: 0 };
    });
    const manager = createPrerequisiteManager({
      isDryRun: false,
      runCommand
    });

    claudeService.registerClaudeCodePrerequisites(manager);
    await manager.run("after");

    expect(calls.map((entry) => entry.command)).toEqual(["claude"]);
    expect(calls[0]).toEqual({
      command: "claude",
      args: [
        "-p",
        "Output exactly: CLAUDE_CODE_OK",
        "--allowedTools",
        "Bash,Read",
        "--permission-mode",
        "acceptEdits",
        "--output-format",
        "text"
      ]
    });
  });

  it("falls back to Windows path lookup when which is unavailable", async () => {
    const captured: Array<{ command: string; args: string[] }> = [];
    const runCommand = vi.fn(async (command: string, args: string[]) => {
      captured.push({ command, args });
      if (command === "which") {
        return { stdout: "", stderr: "not found", exitCode: 1 };
      }
      if (command === "where") {
        return { stdout: "C:\\\\Apps\\\\claude.cmd\r\n", stderr: "", exitCode: 0 };
      }
      return { stdout: "", stderr: "", exitCode: 0 };
    });

    // Test the binary check directly (used during installation)
    const binaryCheck = claudeService.createClaudeCliBinaryCheck();
    await binaryCheck.run({ isDryRun: false, runCommand });

    expect(captured.map((entry) => entry.command)).toEqual(["which", "where"]);
    expect(captured[1]).toEqual({ command: "where", args: ["claude"] });
  });
});
