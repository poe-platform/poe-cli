import { describe, it, expect, beforeEach, vi } from "vitest";
import { Volume, createFsFromVolume } from "memfs";
import path from "node:path";
import type { FileSystem } from "../src/utils/file-system.js";
import * as codexService from "../src/services/codex.js";
import { parseTomlDocument } from "../src/utils/toml.js";
import { createPrerequisiteManager } from "../src/utils/prerequisites.js";

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
    await codexService.configureCodex({
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

    await codexService.configureCodex({
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
    const removed = await codexService.removeCodex({ fs, configPath });
    expect(removed).toBe(true);

    await expect(fs.readFile(configPath, "utf8")).rejects.toThrow();
  });

  it("deletes config when content matches template", async () => {
    await codexService.configureCodex({
      fs,
      configPath,
      model: "gpt-5",
      reasoningEffort: "medium",
      timestamp: () => "20240101T000000"
    });

    const removed = await codexService.removeCodex({ fs, configPath });
    expect(removed).toBe(true);

    await expect(fs.readFile(configPath, "utf8")).rejects.toThrow();
  });

  it("keeps config when file differs from template", async () => {
    await fs.mkdir(configDir, { recursive: true });
    await fs.writeFile(configPath, 'model = "custom"', {
      encoding: "utf8"
    });

    const removed = await codexService.removeCodex({ fs, configPath });
    expect(removed).toBe(false);

    const content = await fs.readFile(configPath, "utf8");
    expect(content).toBe('model = "custom"');
  });

  it("removes codex block with different formatting", async () => {
    await fs.mkdir(configDir, { recursive: true });
    await fs.writeFile(
      configPath,
      [
        'model_provider="poe"',
        'model="gpt-5"',
        'model_reasoning_effort="medium"',
        "",
        "[model_providers.poe]",
        'name="poe"',
        'base_url="https://api.poe.com/v1"',
        'wire_api="chat"',
        'env_key="POE_API_KEY"',
        "",
        "[features]",
        "foo = true",
        ""
      ].join("\n"),
      { encoding: "utf8" }
    );

    const removed = await codexService.removeCodex({ fs, configPath });
    expect(removed).toBe(true);

    const content = await fs.readFile(configPath, "utf8");
    expect(content.trim()).toBe("[features]\nfoo = true");
  });

  it("creates timestamped backup when overwriting existing config", async () => {
    await fs.mkdir(configDir, { recursive: true });
    await fs.writeFile(configPath, "legacy-config", { encoding: "utf8" });

    await codexService.configureCodex({
      fs,
      configPath,
      model: "gpt-5",
      reasoningEffort: "medium",
      timestamp: () => "20240202T101010"
    });

    const backupContent = await fs.readFile(
      `${configPath}.backup.20240202T101010`,
      "utf8"
    );
    expect(backupContent).toBe("legacy-config");
  });

  it("merges codex configuration with existing content", async () => {
    await fs.mkdir(configDir, { recursive: true });
    await fs.writeFile(
      configPath,
      ['model_provider = "legacy"', "", "[features]", "foo = true", ""].join(
        "\n"
      ),
      { encoding: "utf8" }
    );

    await codexService.configureCodex({
      fs,
      configPath,
      model: "gpt-5",
      reasoningEffort: "medium",
      timestamp: () => "20240303T030303"
    });

    const doc = parseTomlDocument(await fs.readFile(configPath, "utf8"));
    expect(doc["model_provider"]).toBe("poe");
    expect(doc["model"]).toBe("gpt-5");
    expect(doc["model_reasoning_effort"]).toBe("medium");
    expect(doc["features"]).toEqual({ foo: true });

    const providers = doc["model_providers"] as Record<string, unknown>;
    expect(providers).toBeDefined();
    const poe = (providers ?? {})["poe"] as Record<string, unknown>;
    expect(poe).toMatchObject({
      name: "poe",
      base_url: "https://api.poe.com/v1",
      wire_api: "chat",
      env_key: "POE_API_KEY"
    });

    const backupContent = await fs.readFile(
      `${configPath}.backup.20240303T030303`,
      "utf8"
    );
    expect(backupContent.trim()).toContain('model_provider = "legacy"');
    expect(backupContent.trim()).toContain("[features]");
  });

  it("spawns the codex CLI with the provided prompt and args", async () => {
    const runCommand = vi.fn(async () => ({
      stdout: "codex-output\n",
      stderr: "",
      exitCode: 0
    }));

    const result = await codexService.spawnCodex({
      prompt: "Describe the codebase",
      args: ["--output", "json"],
      runCommand
    });

    expect(runCommand).toHaveBeenCalledWith("codex", [
      "exec",
      "Describe the codebase",
      "--output",
      "json"
    ]);
    expect(result).toEqual({
      stdout: "codex-output\n",
      stderr: "",
      exitCode: 0
    });
  });

  it("registers prerequisite checks for the Codex CLI", async () => {
    const calls: Array<{ command: string; args: string[] }> = [];
    const runCommand = vi.fn(async (command: string, args: string[]) => {
      calls.push({ command, args });
      if (command === "codex") {
        return { stdout: "CODEX_OK\n", stderr: "", exitCode: 0 };
      }
      return { stdout: "", stderr: "", exitCode: 0 };
    });
    const manager = createPrerequisiteManager({
      isDryRun: false,
      runCommand
    });

    codexService.registerCodexPrerequisites(manager);
    await manager.run("after");

    expect(calls.map((entry) => entry.command)).toEqual(["codex"]);
    expect(calls[0]).toEqual({
      command: "codex",
      args: ["exec", "Output exactly: CODEX_OK"]
    });
  });

  it("includes stdout and stderr when the health check command fails", async () => {
    const runCommand = vi.fn(async () => ({
      stdout: "FAIL_STDOUT\n",
      stderr: "FAIL_STDERR\n",
      exitCode: 1
    }));
    const manager = createPrerequisiteManager({
      isDryRun: false,
      runCommand
    });

    codexService.registerCodexPrerequisites(manager);

    let caught: Error | undefined;
    try {
      await manager.run("after");
    } catch (error) {
      caught = error as Error;
    }

    expect(caught).toBeDefined();
    expect(caught?.message).toContain("stdout:\nFAIL_STDOUT\n");
    expect(caught?.message).toContain("stderr:\nFAIL_STDERR\n");
  });

  it("includes stdout and stderr when the health check output is unexpected", async () => {
    const runCommand = vi.fn(async () => ({
      stdout: "WRONG\n",
      stderr: "WARN\n",
      exitCode: 0
    }));
    const manager = createPrerequisiteManager({
      isDryRun: false,
      runCommand
    });

    codexService.registerCodexPrerequisites(manager);

    let caught: Error | undefined;
    try {
      await manager.run("after");
    } catch (error) {
      caught = error as Error;
    }

    expect(caught).toBeDefined();
    expect(caught?.message).toContain('expected "CODEX_OK" but received "WRONG"');
    expect(caught?.message).toContain("stdout:\nWRONG\n");
    expect(caught?.message).toContain("stderr:\nWARN\n");
  });
});
