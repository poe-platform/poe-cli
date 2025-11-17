import { describe, it, expect, vi, beforeEach } from "vitest";
import { Volume, createFsFromVolume } from "memfs";
import { createProgram } from "../src/cli/program.js";
import type { FileSystem } from "../src/utils/file-system.js";
import type { CommandRunner, CommandRunnerResult } from "../src/utils/prerequisites.js";

function createMemFs(): FileSystem {
  const vol = new Volume();
  vol.mkdirSync("/home/test", { recursive: true });
  return createFsFromVolume(vol).promises as unknown as FileSystem;
}

interface CommandCall {
  command: string;
  args: string[];
}

function createCommandRunnerStub(
  result: CommandRunnerResult = { stdout: "", stderr: "", exitCode: 0 }
): { runner: CommandRunner; calls: CommandCall[] } {
  const calls: CommandCall[] = [];
  const runner: CommandRunner = async (command, args) => {
    calls.push({ command, args });
    return { ...result };
  };
  return { runner, calls };
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
    const { runner, calls } = createCommandRunnerStub({
      stdout: "Agent output\n",
      stderr: "",
      exitCode: 0
    });
    const program = createProgram({
      fs,
      prompts: vi.fn().mockResolvedValue({}),
      env: { cwd, homeDir },
      commandRunner: runner,
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

    expect(calls).toEqual([
      {
        command: "claude",
        args: [
          "-p",
          "Explain the change",
          "--allowedTools",
          "Bash,Read",
          "--permission-mode",
          "acceptEdits",
          "--output-format",
          "text"
        ]
      }
    ]);
    expect(logs).toContain("Agent output");
  });

  it("spawns a codex agent", async () => {
    const logs: string[] = [];
    const { runner, calls } = createCommandRunnerStub({
      stdout: "Codex output\n",
      stderr: "",
      exitCode: 0
    });
    const program = createProgram({
      fs,
      prompts: vi.fn().mockResolvedValue({}),
      env: { cwd, homeDir },
      commandRunner: runner,
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

    expect(calls).toEqual([
      {
        command: "codex",
        args: ["exec", "Summarize the diff", "--full-auto"]
      }
    ]);
    expect(logs).toContain("Codex output");
  });

  it("spawns an opencode agent", async () => {
    const logs: string[] = [];
    const { runner, calls } = createCommandRunnerStub({
      stdout: "OpenCode output\n",
      stderr: "",
      exitCode: 0
    });
    const program = createProgram({
      fs,
      prompts: vi.fn().mockResolvedValue({}),
      env: { cwd, homeDir },
      commandRunner: runner,
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

    expect(calls).toEqual([
      {
        command: "opencode",
        args: ["run", "List files"]
      }
    ]);
    expect(logs).toContain("OpenCode output");
  });

  it("fails when spawn command exits with error", async () => {
    const { runner } = createCommandRunnerStub({
      stdout: "",
      stderr: "spawn failed",
      exitCode: 1
    });
    const program = createProgram({
      fs,
      prompts: vi.fn().mockResolvedValue({}),
      env: { cwd, homeDir },
      commandRunner: runner,
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
  });

  it("skips execution during dry run spawn", async () => {
    const logs: string[] = [];
    const { runner, calls } = createCommandRunnerStub({
      stdout: "Agent output\n",
      stderr: "",
      exitCode: 0
    });
    const program = createProgram({
      fs,
      prompts: vi.fn().mockResolvedValue({}),
      env: { cwd, homeDir },
      commandRunner: runner,
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

    expect(calls).toHaveLength(0);
    expect(
      logs.find((line) =>
        line.includes('Dry run: would spawn Claude Code with prompt "Dry run prompt"')
      )
    ).toBeTruthy();
  });
});
