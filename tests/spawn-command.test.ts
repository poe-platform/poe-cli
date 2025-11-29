import { describe, it, expect, vi, beforeEach } from "vitest";
import { Volume, createFsFromVolume } from "memfs";
import { Command } from "commander";
import { createProgram } from "../src/cli/program.js";
import { registerSpawnCommand } from "../src/cli/commands/spawn.js";
import { createCliContainer, type CliDependencies } from "../src/cli/container.js";
import type { FileSystem } from "../src/utils/file-system.js";
import type { CommandRunner, CommandRunnerResult } from "../src/utils/hooks.js";
import { FRONTIER_MODELS } from "../src/cli/constants.js";

const cwd = "/repo";
const homeDir = "/home/test";

function createMemFs(): FileSystem {
  const vol = new Volume();
  vol.mkdirSync(homeDir, { recursive: true });
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

function createContainerWithDependencies(
  overrides: Partial<CliDependencies> = {}
): {
  container: ReturnType<typeof createCliContainer>;
  logs: string[];
  commandCalls: CommandCall[];
} {
  const logs: string[] = [];
  const { runner, calls } = createCommandRunnerStub();
  const container = createCliContainer({
    fs: overrides.fs ?? createMemFs(),
    prompts: overrides.prompts ?? vi.fn().mockResolvedValue({}),
    env: overrides.env ?? { cwd, homeDir },
    commandRunner: overrides.commandRunner ?? runner,
    logger: overrides.logger ?? ((message) => {
      logs.push(message);
    })
  });
  return { container, logs, commandCalls: calls };
}

describe("spawn command", () => {
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
      { command: "claude", args: ["--version"] },
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
    expect(logs.some((message) => message.includes("Agent output"))).toBe(true);
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
      { command: "codex", args: ["--version"] },
      {
        command: "codex",
        args: ["exec", "Summarize the diff", "--full-auto"]
      }
    ]);
    expect(logs.some((message) => message.includes("Codex output"))).toBe(true);
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
      { command: "opencode", args: ["--version"] },
      {
        command: "opencode",
        args: ["--model", FRONTIER_MODELS[0]!.id, "run", "List files"]
      }
    ]);
    expect(logs.some((message) => message.includes("OpenCode output"))).toBe(
      true
    );
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

  it("invokes custom spawn handlers when provided", async () => {
    const { container, logs, commandCalls } = createContainerWithDependencies();
    const program = new Command();
    program.exitOverride();
    registerSpawnCommand(program, container, {
      handlers: {
        "poe-code": async (ctx) => {
          logs.push(`custom:${ctx.prompt}`);
          expect(ctx.service).toBe("poe-code");
          expect(ctx.args).toEqual(["--model", "beta"]);
        }
      }
    });

    await program.parseAsync([
      "node",
      "cli",
      "spawn",
      "poe-code",
      "Explain the change",
      "--",
      "--model",
      "beta"
    ]);

    expect(logs).toContain("custom:Explain the change");
    expect(commandCalls).toHaveLength(0);
  });

  it("includes extra services in spawn help output", () => {
    const { container } = createContainerWithDependencies();
    const program = new Command();
    registerSpawnCommand(program, container, {
      extraServices: ["poe-code", "beta-agent"]
    });

    const spawnCommand = program.commands.find((cmd) => cmd.name() === "spawn");
    expect(spawnCommand).toBeDefined();
    const help = spawnCommand?.helpInformation() ?? "";
    expect(help).toContain("poe-code");
    expect(help).toContain("beta-agent");
  });

  it("passes through model override via CLI flag", async () => {
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

    const override =
      FRONTIER_MODELS[FRONTIER_MODELS.length - 1]!.id;

    await program.parseAsync([
      "node",
      "cli",
      "spawn",
      "--model",
      override,
      "opencode",
      "List files"
    ]);

    expect(calls).toEqual([
      { command: "opencode", args: ["--version"] },
      {
        command: "opencode",
        args: ["--model", override, "run", "List files"]
      }
    ]);
    expect(logs.some((message) => message.includes("OpenCode output"))).toBe(true);
  });
});
