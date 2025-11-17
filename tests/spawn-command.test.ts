import { describe, it, expect, vi, beforeEach } from "vitest";
import { Volume, createFsFromVolume } from "memfs";
import { createProgram } from "../src/cli/program.js";
import type { FileSystem } from "../src/utils/file-system.js";
import * as claudeService from "../src/services/claude-code.js";
import * as codexService from "../src/services/codex.js";
import * as opencodeService from "../src/services/opencode.js";

function createMemFs(): FileSystem {
  const vol = new Volume();
  vol.mkdirSync("/home/test", { recursive: true });
  return createFsFromVolume(vol).promises as unknown as FileSystem;
}

describe("spawn command", () => {
  const cwd = "/repo";
  const homeDir = "/home/test";
  let fs: FileSystem;

  beforeEach(() => {
    fs = createMemFs();
    vi.clearAllMocks();
  });

  it("spawns a claude-code agent", async () => {
    const logs: string[] = [];
    const spawnSpy = vi
      .spyOn(claudeService, "spawnClaudeCode")
      .mockResolvedValue({
        stdout: "Agent output\n",
        stderr: "",
        exitCode: 0
      });
    const program = createProgram({
      fs,
      prompts: vi.fn().mockResolvedValue({}),
      env: { cwd, homeDir },
      logger: (message) => {
        logs.push(message);
      }
    });

    await program.parseAsync([
      "node",
      "cli",
      "spawn",
      "claude-code",
      "Explain the change"
    ]);

    expect(spawnSpy).toHaveBeenCalledWith({
      prompt: "Explain the change",
      args: [],
      runCommand: expect.any(Function)
    });
    expect(logs).toContain("Agent output");
    spawnSpy.mockRestore();
  });

  it("spawns a codex agent", async () => {
    const logs: string[] = [];
    const spawnSpy = vi.spyOn(codexService, "spawnCodex").mockResolvedValue({
      stdout: "Codex output\n",
      stderr: "",
      exitCode: 0
    });
    const program = createProgram({
      fs,
      prompts: vi.fn().mockResolvedValue({}),
      env: { cwd, homeDir },
      logger: (message) => {
        logs.push(message);
      }
    });

    await program.parseAsync([
      "node",
      "cli",
      "spawn",
      "codex",
      "Summarize the diff"
    ]);

    expect(spawnSpy).toHaveBeenCalledWith({
      prompt: "Summarize the diff",
      args: [],
      runCommand: expect.any(Function)
    });
    expect(logs).toContain("Codex output");
    spawnSpy.mockRestore();
  });

  it("spawns an opencode agent", async () => {
    const logs: string[] = [];
    const spawnSpy = vi
      .spyOn(opencodeService, "spawnOpenCode")
      .mockResolvedValue({
        stdout: "OpenCode output\n",
        stderr: "",
        exitCode: 0
      });
    const program = createProgram({
      fs,
      prompts: vi.fn().mockResolvedValue({}),
      env: { cwd, homeDir },
      logger: (message) => {
        logs.push(message);
      }
    });

    await program.parseAsync([
      "node",
      "cli",
      "spawn",
      "opencode",
      "List files"
    ]);

    expect(spawnSpy).toHaveBeenCalledWith({
      prompt: "List files",
      args: [],
      runCommand: expect.any(Function)
    });
    expect(logs).toContain("OpenCode output");
    spawnSpy.mockRestore();
  });

  it("fails when spawn command exits with error", async () => {
    const spawnSpy = vi
      .spyOn(claudeService, "spawnClaudeCode")
      .mockResolvedValue({
        stdout: "",
        stderr: "spawn failed",
        exitCode: 1
      });
    const program = createProgram({
      fs,
      prompts: vi.fn().mockResolvedValue({}),
      env: { cwd, homeDir },
      logger: () => {}
    });

    await expect(
      program.parseAsync([
        "node",
        "cli",
        "spawn",
        "claude-code",
        "Explain the change"
      ])
    ).rejects.toThrow(/spawn failed/i);
    spawnSpy.mockRestore();
  });

  it("skips execution during dry run spawn", async () => {
    const logs: string[] = [];
    const spawnSpy = vi
      .spyOn(claudeService, "spawnClaudeCode")
      .mockResolvedValue({
        stdout: "Agent output\n",
        stderr: "",
        exitCode: 0
      });
    const program = createProgram({
      fs,
      prompts: vi.fn().mockResolvedValue({}),
      env: { cwd, homeDir },
      logger: (message) => {
        logs.push(message);
      }
    });

    await program.parseAsync([
      "node",
      "cli",
      "--dry-run",
      "spawn",
      "claude-code",
      "Dry run prompt"
    ]);

    expect(spawnSpy).not.toHaveBeenCalled();
    expect(
      logs.find((line) =>
        line.includes('Dry run: would spawn Claude Code with prompt "Dry run prompt"')
      )
    ).toBeTruthy();
    spawnSpy.mockRestore();
  });
});