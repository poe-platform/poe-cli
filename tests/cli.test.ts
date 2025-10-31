import { describe, it, expect, beforeEach, vi } from "vitest";
const interactiveLauncherMock = vi.hoisted(() => ({
  launchInteractiveMode: vi.fn()
}));
vi.mock("../src/cli/interactive-launcher.js", () => interactiveLauncherMock);
import chalk from "chalk";
import { Volume, createFsFromVolume } from "memfs";
import path from "node:path";
import type { FileSystem } from "../src/utils/file-system.js";
import { createProgram } from "../src/cli/program.js";
import { launchInteractiveMode } from "../src/cli/interactive-launcher.js";
import type { CommandRunner } from "../src/utils/prerequisites.js";
import * as claudeService from "../src/services/claude-code.js";
import * as codexService from "../src/services/codex.js";
import * as opencodeService from "../src/services/opencode.js";

interface PromptCall {
  name: string;
  message?: string;
  type?: string;
}

interface CommandCall {
  command: string;
  args: string[];
}

interface ChatFactoryCall {
  prompt: string;
  options: {
    apiKey: string;
    model: string;
    cwd: string;
    homeDir: string;
  };
}

function createMemFs(): { fs: FileSystem; vol: Volume } {
  const vol = new Volume();
  const fs = createFsFromVolume(vol);
  return { fs: fs.promises as unknown as FileSystem, vol };
}

function createPromptStub(responses: Record<string, unknown>) {
  const calls: PromptCall[] = [];
  const prompt = async (questions: any) => {
    const list = Array.isArray(questions) ? questions : [questions];
    const result: Record<string, unknown> = {};
    for (const q of list) {
      calls.push({ name: q.name, message: q.message, type: q.type });
      if (!(q.name in responses)) {
        throw new Error(`Missing response for prompt "${q.name}"`);
      }
      result[q.name] = responses[q.name];
    }
    return result;
  };

  return { prompt, calls };
}

function createCommandRunnerStub(options?: {
  whichExitCode?: number;
  claudeExitCode?: number;
  claudeStdout?: string;
}): { runner: CommandRunner; calls: CommandCall[] } {
  const {
    whichExitCode = 0,
    claudeExitCode = 0,
    claudeStdout = "CLAUDE_CODE_OK\n"
  } = options ?? {};
  const calls: CommandCall[] = [];
  const runnerImpl = async (command: string, args: string[]) => {
    calls.push({ command, args });
    if (command === "which") {
      if (whichExitCode !== 0) {
        return { stdout: "", stderr: "not found", exitCode: whichExitCode };
      }
      return { stdout: "/usr/bin/claude\n", stderr: "", exitCode: 0 };
    }
    if (command === "claude") {
      return { stdout: claudeStdout, stderr: "", exitCode: claudeExitCode };
    }
    return { stdout: "", stderr: "", exitCode: 0 };
  };
  const runner = vi.fn(runnerImpl) as unknown as CommandRunner;

  return { runner, calls };
}

function createInstallCommandRunner(options: {
  binary: string;
  installCommand: string;
  installArgs: string[];
  postChecks?: Array<{ command: string; args: string[]; stdout?: string }>;
}): { runner: CommandRunner; calls: CommandCall[] } {
  let installed = false;
  const calls: CommandCall[] = [];
  const runner = vi.fn(async (command: string, args: string[]) => {
    calls.push({ command, args });
    if (command === "which") {
      if (installed) {
        return {
          stdout: `/usr/local/bin/${options.binary}\n`,
          stderr: "",
          exitCode: 0
        };
      }
      return { stdout: "", stderr: "not found", exitCode: 1 };
    }
    if (command === "where") {
      if (installed) {
        return {
          stdout: `/usr/local/bin/${options.binary}\n`,
          stderr: "",
          exitCode: 0
        };
      }
      return { stdout: "", stderr: "", exitCode: 1 };
    }
    if (command === "test" || command === "ls") {
      return installed
        ? { stdout: "", stderr: "", exitCode: 0 }
        : { stdout: "", stderr: "", exitCode: 1 };
    }
    if (
      command === options.installCommand &&
      args.length === options.installArgs.length &&
      args.every((value, index) => value === options.installArgs[index])
    ) {
      installed = true;
      return { stdout: "", stderr: "", exitCode: 0 };
    }
    if (options.postChecks) {
      const match = options.postChecks.find(
        (check) =>
          check.command === command &&
          check.args.length === args.length &&
          check.args.every((value, index) => value === args[index])
      );
      if (match) {
        return { stdout: match.stdout ?? "", stderr: "", exitCode: 0 };
      }
    }
    return { stdout: "", stderr: "", exitCode: 0 };
  }) as unknown as CommandRunner;

  return { runner, calls };
}

const CLAUDE_HELPER_LINES = [
  "#!/bin/bash",
  'node -e "console.log(require(\'/home/user/.poe-setup/credentials.json\').apiKey)"'
];
const CLAUDE_HELPER_CONTENT = CLAUDE_HELPER_LINES.join("\n");

function createChatServiceStub(response: {
  content: string;
  model?: string;
}) {
  const calls: ChatFactoryCall[] = [];
  const factory = vi.fn((options: any) => {
    const model = response.model ?? "Claude-Sonnet-4.5";
    return {
      setToolCallCallback: vi.fn(),
      getModel: () => model,
      async sendMessage(prompt: string) {
        calls.push({
          prompt,
          options: {
            apiKey: options.apiKey,
            model: options.model,
            cwd: options.cwd,
            homeDir: options.homeDir
          }
        });
        return { role: "assistant", content: response.content };
      },
      dispose: vi.fn()
    };
  });

  return { factory, calls };
}

describe("CLI program", () => {
  let fs: FileSystem;
  let vol: Volume;
  const cwd = "/workspace";
  const homeDir = "/home/user";

beforeEach(() => {
  ({ fs, vol } = createMemFs());
  vol.mkdirSync(cwd, { recursive: true });
  vol.mkdirSync(homeDir, { recursive: true });
  vi.mocked(launchInteractiveMode).mockReset();
});

  it("exposes poe-setup as the command name", () => {
    const { prompt } = createPromptStub({});
    const program = createProgram({
      fs,
      prompts: prompt,
      env: { cwd, homeDir },
      logger: () => {}
    });

    expect(program.name()).toBe("poe-setup");
  });

  it("launches interactive mode when no command is provided", async () => {
    const { prompt } = createPromptStub({});
    const program = createProgram({
      fs,
      prompts: prompt,
      env: { cwd, homeDir },
      logger: () => {}
    });

    await program.parseAsync(["node", "cli"]);

    expect(vi.mocked(launchInteractiveMode)).toHaveBeenCalledTimes(1);
    const call = vi.mocked(launchInteractiveMode).mock.calls[0];
    expect(call?.[0]).toMatchObject({
      fs,
      prompts: prompt,
      env: { cwd, homeDir }
    });
  });

  it("prompts to select a service when configure is invoked without target", async () => {
    const promptStub = createPromptStub({
      serviceSelection: 1,
      apiKey: "prompted-key"
    });
    const commandRunnerStub = createCommandRunnerStub();
    const logs: string[] = [];
    const program = createProgram({
      fs,
      prompts: promptStub.prompt,
      env: { cwd, homeDir },
      logger: (message) => {
        logs.push(message);
      },
      commandRunner: commandRunnerStub.runner
    });

    await program.parseAsync(["node", "cli", "configure"]);

    expect(vi.mocked(launchInteractiveMode)).not.toHaveBeenCalled();
    expect(logs).toContain("1) claude-code");
    expect(logs).toContain("2) codex");
    expect(logs).toContain("3) opencode");
    expect(logs).toContain("4) roo-code");
    expect(
      logs.find((line) => line.startsWith("Enter number that you want to configure"))
    ).toBeTruthy();

    const settings = await fs.readFile(
      path.join(homeDir, ".claude", "settings.json"),
      "utf8"
    );
    const parsed = JSON.parse(settings);
    expect(parsed).toEqual({
      apiKeyHelper: path.join(homeDir, ".claude", "anthropic_key.sh"),
      env: {
        ANTHROPIC_BASE_URL: "https://api.poe.com"
      }
    });
    const helper = await fs.readFile(
      path.join(homeDir, ".claude", "anthropic_key.sh"),
      "utf8"
    );
    expect(helper).toBe(CLAUDE_HELPER_CONTENT);
  });

  it("does not register publish-placeholder command", () => {
    const { prompt } = createPromptStub({});
    const program = createProgram({
      fs,
      prompts: prompt,
      env: { cwd, homeDir },
      logger: () => {}
    });

    expect(program.commands.map((command) => command.name())).not.toContain(
      "publish-placeholder"
    );
  });

  it("configures opencode CLI integration", async () => {
    const { prompt } = createPromptStub({});
    const commandRunner = createInstallCommandRunner({
      binary: "opencode",
      installCommand: "npm",
      installArgs: ["install", "-g", "opencode-ai"],
      postChecks: [
        { command: "opencode", args: ["--version"] },
        {
          command: "opencode",
          args: ["run", "Output exactly: OPEN_CODE_OK"],
          stdout: "OPEN_CODE_OK\n"
        }
      ]
    });
    const logs: string[] = [];
    const program = createProgram({
      fs,
      prompts: prompt,
      env: { cwd, homeDir },
      logger: (message) => {
        logs.push(message);
      },
      commandRunner: commandRunner.runner
    });

    await program.parseAsync([
      "node",
      "cli",
      "configure",
      "opencode",
      "--api-key",
      "sk-test"
    ]);

    const config = JSON.parse(
      await fs.readFile(
        path.join(homeDir, ".config", "opencode", "config.json"),
        "utf8"
      )
    );
    expect(config).toEqual({
      $schema: "https://opencode.ai/config.json",
      provider: {
        poe: {
          npm: "@ai-sdk/openai-compatible",
          name: "poe.com",
          options: {
            baseURL: "https://api.poe.com/v1"
          },
          models: {
            "Claude-Sonnet-4.5": {
              name: "Claude Sonnet 4.5"
            },
            "GPT-5-Codex": {
              name: "GPT-5-Codex"
            }
          }
        }
      }
    });

    const auth = JSON.parse(
      await fs.readFile(
        path.join(homeDir, ".local", "share", "opencode", "auth.json"),
        "utf8"
      )
    );
    expect(auth).toEqual({
      poe: {
        type: "api",
        key: "sk-test"
      }
    });

    expect(
      logs.find((line) => line.includes("Configured OpenCode CLI."))
    ).toBeTruthy();
    expect(
      commandRunner.calls.some(
        (call) =>
          call.command === "npm" &&
          call.args[0] === "install" &&
          call.args.includes("opencode-ai")
      )
    ).toBe(true);
  });

  it("configures roo code integration", async () => {
    const { prompt } = createPromptStub({});
    const logs: string[] = [];
    const program = createProgram({
      fs,
      prompts: prompt,
      env: { cwd, homeDir, platform: "darwin" } as any,
      logger: (message) => {
        logs.push(message);
      }
    });

    await program.parseAsync([
      "node",
      "cli",
      "configure",
      "roo-code",
      "--api-key",
      "sk-test",
      "--config-name",
      "primary"
    ]);

    const configPath = path.join(homeDir, "Documents", "roo-config.json");
    const config = JSON.parse(await fs.readFile(configPath, "utf8"));
    expect(config.providerProfiles.currentApiConfigName).toBe("primary");
    expect(config.providerProfiles.modeApiConfigs).toEqual({});
    const profile = config.providerProfiles.apiConfigs.primary;
    expect(profile).toMatchObject({
      apiProvider: "openai",
      openAiApiKey: "sk-test",
      openAiBaseUrl: "https://api.poe.com/v1",
      openAiModelId: "Claude-Sonnet-4.5",
      rateLimitSeconds: 0,
      diffEnabled: true
    });
    expect(typeof profile.id).toBe("string");
    expect(profile.id.length).toBeGreaterThan(0);

    const settingsPath = path.join(
      homeDir,
      "Library",
      "Application Support",
      "Code",
      "User",
      "settings.json"
    );
    const settings = JSON.parse(await fs.readFile(settingsPath, "utf8"));
    expect(settings["roo-cline.autoImportSettingsPath"]).toBe(
      "~/Documents/roo-config.json"
    );

    expect(logs).toContain("Configured Roo Code.");
  });

  it("simulates commands without writing when using --dry-run", async () => {
    const { prompt } = createPromptStub({ apiKey: "prompted-key" });
    const commandRunner = createInstallCommandRunner({
      binary: "codex",
      installCommand: "npm",
      installArgs: ["install", "-g", "@openai/codex"],
      postChecks: [
        {
          command: "codex",
          args: codexService.buildCodexExecArgs("Output exactly: CODEX_OK"),
          stdout: "CODEX_OK\n"
        }
      ]
    });
    const logs: string[] = [];
    const program = createProgram({
      fs,
      prompts: prompt,
      env: { cwd, homeDir },
      logger: (message) => {
        logs.push(message);
      },
      commandRunner: commandRunner.runner
    });

    await program.parseAsync([
      "node",
      "cli",
      "--dry-run",
      "configure",
      "codex",
      "--model",
      "gpt-5",
      "--reasoning-effort",
      "medium"
    ]);

    await expect(
      fs.readFile(path.join(homeDir, ".codex", "config.toml"), "utf8")
    ).rejects.toThrow();
    expect(logs).toContain("Dry run: would configure Codex.");
    expect(logs).toContain(
      `${chalk.green("cat > /home/user/.codex/config.toml")} ${chalk.dim("# create")}`
    );

    await program.parseAsync([
      "node",
      "cli",
      "--dry-run",
      "init",
      "--project-name",
      "demo",
      "--api-key",
      "secret"
    ]);

    await expect(
      fs.readFile(path.join(cwd, "demo", ".env"), "utf8")
    ).rejects.toThrow();
    expect(logs).toContain('Dry run: would initialize project "demo".');
    expect(logs).toContain(
      `${chalk.green("cat > /workspace/demo/.env")} ${chalk.dim("# create")}`
    );
    expect(
      commandRunner.calls.filter((call) => call.command === "which").length
    ).toBeGreaterThanOrEqual(1);
    expect(
      commandRunner.calls.some((call) => call.command === "npm")
    ).toBe(false);
  });

  it("renders unified diff output for dry-run updates", async () => {
    const { prompt } = createPromptStub({});
    const commandRunnerStub = createCommandRunnerStub();
    const logs: string[] = [];
    const program = createProgram({
      fs,
      prompts: prompt,
      env: { cwd, homeDir },
      logger: (message) => {
        logs.push(message);
      },
      commandRunner: commandRunnerStub.runner
    });
    const settingsPath = path.join(homeDir, ".claude", "settings.json");
    vol.mkdirSync(path.dirname(settingsPath), { recursive: true });
    vol.writeFileSync(
      settingsPath,
      JSON.stringify(
        {
          env: {
            POE_API_KEY: "old-key",
            ANTHROPIC_BASE_URL: "https://api.poe.com",
            ANTHROPIC_API_KEY: "old-key"
          }
        },
        null,
        2
      ) + "\n",
      "utf8"
    );

    await program.parseAsync([
      "node",
      "cli",
      "--dry-run",
      "configure",
      "claude-code",
      "--api-key",
      "new-key"
    ]);

    expect(logs).toContain("Claude Code (dry run)");
    expect(logs.some((line) => line.includes("@@"))).toBe(true);
    expect(
      logs.some(
        (line) =>
          line.includes('"POE_API_KEY": "old-key"')
      )
    ).toBe(true);
    expect(
      logs.some(
        (line) =>
          line.startsWith(chalk.green("+")) &&
          line.includes('"apiKeyHelper": "/home/user/.claude/anthropic_key.sh"')
      )
    ).toBe(true);
  });

  it("reports mutation outcomes during claude-code dry runs", async () => {
    const { prompt } = createPromptStub({});
    const commandRunnerStub = createCommandRunnerStub();
    const logs: string[] = [];
    const program = createProgram({
      fs,
      prompts: prompt,
      env: { cwd, homeDir },
      logger: (message) => {
        logs.push(message);
      },
      commandRunner: commandRunnerStub.runner
    });
    const settingsPath = path.join(homeDir, ".claude", "settings.json");
    const helperPath = path.join(homeDir, ".claude", "anthropic_key.sh");
    vol.mkdirSync(path.dirname(settingsPath), { recursive: true });
    vol.writeFileSync(
      settingsPath,
      JSON.stringify(
        {
          apiKeyHelper: helperPath,
          env: {
            ANTHROPIC_BASE_URL: "https://api.poe.com"
          }
        },
        null,
        2
      ) + "\n",
      "utf8"
    );
    vol.writeFileSync(helperPath, `${CLAUDE_HELPER_CONTENT}\n`, "utf8");

    await program.parseAsync([
      "node",
      "cli",
      "--dry-run",
      "configure",
      "claude-code",
      "--api-key",
      "prompted-key"
    ]);

    expect(logs).toContain("Claude Code (dry run)");
    expect(
      logs
    ).toContain(
      `${chalk.dim("mkdir -p /home/user/.claude")} ${chalk.dim("# no change")}`
    );
    expect(
      logs
    ).toContain(
      `${chalk.cyan("chmod 700 /home/user/.claude/anthropic_key.sh")} ${chalk.dim("# permissions")}`
    );
    expect(
      logs
    ).toContain(
      `${chalk.dim("cat > /home/user/.claude/anthropic_key.sh")} ${chalk.dim("# no change")}`
    );
    expect(
      logs
    ).toContain(
      `${chalk.dim("cat > /home/user/.claude/settings.json")} ${chalk.dim("# no change")}`
    );
    expect(logs.some((line) => line.includes("Applying"))).toBe(false);
    expect(logs.some((line) => line.includes("previous:"))).toBe(false);
  });

  it("uses command-style verbose logs for claude-code mutations", async () => {
    const { prompt } = createPromptStub({});
    const commandRunnerStub = createCommandRunnerStub();
    const logs: string[] = [];
    const program = createProgram({
      fs,
      prompts: prompt,
      env: { cwd, homeDir },
      logger: (message) => {
        logs.push(message);
      },
      commandRunner: commandRunnerStub.runner
    });
    const settingsPath = path.join(homeDir, ".claude", "settings.json");
    const helperPath = path.join(homeDir, ".claude", "anthropic_key.sh");
    vol.mkdirSync(path.dirname(settingsPath), { recursive: true });
    vol.writeFileSync(
      settingsPath,
      JSON.stringify(
        {
          apiKeyHelper: helperPath,
          env: {
            ANTHROPIC_BASE_URL: "https://api.poe.com"
          }
        },
        null,
        2
      ) + "\n",
      "utf8"
    );
    vol.writeFileSync(helperPath, `${CLAUDE_HELPER_CONTENT}\n`, "utf8");

    await program.parseAsync([
      "node",
      "cli",
      "--dry-run",
      "--verbose",
      "configure",
      "claude-code",
      "--api-key",
      "prompted-key"
    ]);

    expect(logs).toContain(
      `${chalk.dim("mkdir -p /home/user/.claude")} ${chalk.dim("# no change")}`
    );
    expect(logs).toContain(
      `${chalk.dim("cat > /home/user/.claude/anthropic_key.sh")} ${chalk.dim("# no change")}`
    );
    expect(logs).toContain(
      `${chalk.dim("cat > /home/user/.claude/settings.json")} ${chalk.dim("# no change")}`
    );
    expect(logs).toContain(
      `${chalk.cyan("chmod 700 /home/user/.claude/anthropic_key.sh")} ${chalk.dim("# permissions")}`
    );
    expect(logs.some((line) => line.includes("Applying"))).toBe(false);
    expect(
      logs.some((line) => line.includes("Ensure Claude settings directory"))
    ).toBe(false);
  });

  it("runs init command with provided options", async () => {
    const { prompt } = createPromptStub({});
    const program = createProgram({
      fs,
      prompts: prompt,
      env: { cwd, homeDir },
      logger: () => {}
    });

    await program.parseAsync([
      "node",
      "cli",
      "init",
      "--project-name",
      "demo",
      "--api-key",
      "secret",
      "--model",
      "gpt-5"
    ]);

    const envFile = await fs.readFile(
      path.join(cwd, "demo", ".env"),
      "utf8"
    );
    expect(envFile).toContain("POE_API_KEY=secret");
  });

  it("prompts for missing api key when configuring claude-code", async () => {
    const promptStub = createPromptStub({ apiKey: "prompted-key" });
    const commandRunnerStub = createCommandRunnerStub();
    const program = createProgram({
      fs,
      prompts: promptStub.prompt,
      env: { cwd, homeDir },
      logger: () => {},
      commandRunner: commandRunnerStub.runner
    });

    await program.parseAsync(["node", "cli", "configure", "claude-code"]);

    const settings = await fs.readFile(
      path.join(homeDir, ".claude", "settings.json"),
      "utf8"
    );
    const parsedSettings = JSON.parse(settings);
    expect(parsedSettings).toEqual({
      apiKeyHelper: path.join(homeDir, ".claude", "anthropic_key.sh"),
      env: {
        ANTHROPIC_BASE_URL: "https://api.poe.com"
      }
    });
    const helper = await fs.readFile(
      path.join(homeDir, ".claude", "anthropic_key.sh"),
      "utf8"
    );
    expect(helper).toBe(CLAUDE_HELPER_CONTENT);

    expect(promptStub.calls.map((c) => c.name)).toContain("apiKey");
    expect(commandRunnerStub.calls.map((call) => call.command)).toEqual([
      "which",
      "claude"
    ]);
    expect(commandRunnerStub.calls[0]).toEqual({
      command: "which",
      args: ["claude"]
    });
    expect(commandRunnerStub.calls[1]).toEqual({
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

  it("fails when the claude binary is missing and installation fails", async () => {
    const promptStub = createPromptStub({ apiKey: "prompted-key" });
    const commandCalls: CommandCall[] = [];
    const commandRunner = vi.fn(async (command: string, args: string[]) => {
      commandCalls.push({ command, args });
      // All detection methods fail before and after npm install
      if (command === "which" || command === "where" || command === "test" || command === "ls") {
        return { stdout: "", stderr: "not found", exitCode: 1 };
      }
      // npm install succeeds but binary still not found after
      if (command === "npm") {
        return { stdout: "", stderr: "", exitCode: 0 };
      }
      return { stdout: "", stderr: "", exitCode: 0 };
    }) as unknown as CommandRunner;
    
    const program = createProgram({
      fs,
      prompts: promptStub.prompt,
      env: { cwd, homeDir },
      logger: () => {},
      commandRunner
    });

    await expect(
      program.parseAsync(["node", "cli", "configure", "claude-code"])
    ).rejects.toThrow(/claude cli binary not found/i);
    
    // Should try detection, install, then try detection again
    expect(commandCalls.some(call => call.command === "npm")).toBe(true);
    
    await expect(
      fs.readFile(path.join(homeDir, ".claude", "settings.json"), "utf8")
    ).rejects.toThrow();
  });

  it("fails when the claude check does not emit the expected marker", async () => {
    const promptStub = createPromptStub({ apiKey: "prompted-key" });
    const commandRunnerStub = createCommandRunnerStub({ claudeStdout: "nope" });
    const program = createProgram({
      fs,
      prompts: promptStub.prompt,
      env: { cwd, homeDir },
      logger: () => {},
      commandRunner: commandRunnerStub.runner
    });

    await expect(
      program.parseAsync(["node", "cli", "configure", "claude-code"])
    ).rejects.toThrow(/Claude CLI health check failed/);
    expect(commandRunnerStub.calls).toHaveLength(2);
    expect(commandRunnerStub.calls[0]).toEqual({
      command: "which",
      args: ["claude"]
    });
    expect(commandRunnerStub.calls[1]).toEqual({
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

  it("is idempotent when configuring claude-code", async () => {
    const promptStub = createPromptStub({ apiKey: "prompted-key" });
    const commandRunnerStub = createCommandRunnerStub();
    const program = createProgram({
      fs,
      prompts: promptStub.prompt,
      env: { cwd, homeDir },
      logger: () => {},
      commandRunner: commandRunnerStub.runner
    });

    await program.parseAsync(["node", "cli", "configure", "claude-code"]);
    const firstSettings = await fs.readFile(
      path.join(homeDir, ".claude", "settings.json"),
      "utf8"
    );
    await program.parseAsync(["node", "cli", "configure", "claude-code"]);
    const secondSettings = await fs.readFile(
      path.join(homeDir, ".claude", "settings.json"),
      "utf8"
    );
    expect(firstSettings).toEqual(secondSettings);
    expect(commandRunnerStub.calls).toHaveLength(4);
    expect(
      commandRunnerStub.calls.map((call) => `${call.command}:${call.args.join(" ")}`)
    ).toEqual([
      "which:claude",
      "claude:-p Output exactly: CLAUDE_CODE_OK --allowedTools Bash,Read --permission-mode acceptEdits --output-format text",
      "which:claude",
      "claude:-p Output exactly: CLAUDE_CODE_OK --allowedTools Bash,Read --permission-mode acceptEdits --output-format text"
    ]);
  });

  it("removes codex configuration", async () => {
    const { prompt } = createPromptStub({ apiKey: "prompted-key" });
    const commandRunner = createInstallCommandRunner({
      binary: "codex",
      installCommand: "npm",
      installArgs: ["install", "-g", "@openai/codex"],
      postChecks: [
        { command: "codex", args: ["--version"] },
        {
          command: "codex",
          args: codexService.buildCodexExecArgs("Output exactly: CODEX_OK"),
          stdout: "CODEX_OK\n"
        }
      ]
    });
    const program = createProgram({
      fs,
      prompts: prompt,
      env: { cwd, homeDir },
      logger: () => {},
      commandRunner: commandRunner.runner
    });

    await program.parseAsync([
      "node",
      "cli",
      "configure",
      "codex",
      "--model",
      "gpt-5",
      "--reasoning-effort",
      "medium"
    ]);

    await program.parseAsync(["node", "cli", "remove", "codex"]);

    await expect(
      fs.readFile(path.join(homeDir, ".codex", "config.toml"), "utf8")
    ).rejects.toThrow();
    expect(
      commandRunner.calls.some(
        (call) =>
          call.command === "npm" &&
          call.args.length === 3 &&
          call.args[0] === "install" &&
          call.args[2] === "@openai/codex"
      )
    ).toBe(true);
  });

  it("stores prompted api key during configure", async () => {
    const responses: Record<string, unknown> = { apiKey: "prompted-key" };
    const promptStub = createPromptStub(responses);
    const commandRunnerStub = createCommandRunnerStub();
    const program = createProgram({
      fs,
      prompts: promptStub.prompt,
      env: { cwd, homeDir },
      logger: () => {},
      commandRunner: commandRunnerStub.runner
    });
    const credentialsPath = path.join(homeDir, ".poe-setup", "credentials.json");

    await program.parseAsync(["node", "cli", "configure", "claude-code"]);

    const stored = await fs.readFile(credentialsPath, "utf8");
    expect(JSON.parse(stored)).toEqual({ apiKey: "prompted-key" });
  });

  it("stores api key provided via option", async () => {
    const { prompt } = createPromptStub({});
    const commandRunnerStub = createCommandRunnerStub();
    const program = createProgram({
      fs,
      prompts: prompt,
      env: { cwd, homeDir },
      logger: () => {},
      commandRunner: commandRunnerStub.runner
    });
    const credentialsPath = path.join(homeDir, ".poe-setup", "credentials.json");

    await program.parseAsync([
      "node",
      "cli",
      "configure",
      "claude-code",
      "--api-key",
      "option-key"
    ]);

    const stored = await fs.readFile(credentialsPath, "utf8");
    expect(JSON.parse(stored)).toEqual({ apiKey: "option-key" });
  });

  it("stores api key via login and reuses it for configure", async () => {
    const responses: Record<string, unknown> = { apiKey: "stored-key" };
    const promptStub = createPromptStub(responses);
    const commandRunnerStub = createCommandRunnerStub();
    const logs: string[] = [];
    const program = createProgram({
      fs,
      prompts: promptStub.prompt,
      env: { cwd, homeDir },
      logger: (message) => {
        logs.push(message);
      },
      commandRunner: commandRunnerStub.runner
    });
    const credentialsPath = path.join(homeDir, ".poe-setup", "credentials.json");

    await program.parseAsync(["node", "cli", "login"]);

    const stored = await fs.readFile(credentialsPath, "utf8");
    expect(JSON.parse(stored)).toEqual({ apiKey: "stored-key" });
    expect(logs).toContain(
      `Poe API key stored at ${credentialsPath}.`
    );

    delete responses.apiKey;

    await program.parseAsync(["node", "cli", "configure", "claude-code"]);

    const settings = await fs.readFile(
      path.join(homeDir, ".claude", "settings.json"),
      "utf8"
    );
    const parsedSettings = JSON.parse(settings);
    expect(parsedSettings).toEqual({
      apiKeyHelper: path.join(homeDir, ".claude", "anthropic_key.sh"),
      env: {
        ANTHROPIC_BASE_URL: "https://api.poe.com"
      }
    });
  });

  it("prompts for poe api key with guidance and hidden input", async () => {
    const responses: Record<string, unknown> = { apiKey: "hidden-key" };
    const promptStub = createPromptStub(responses);
    const program = createProgram({
      fs,
      prompts: promptStub.prompt,
      env: { cwd, homeDir },
      logger: () => {}
    });

    await program.parseAsync(["node", "cli", "login"]);

    const apiKeyPrompt = promptStub.calls.find((call) => call.name === "apiKey");
    expect(apiKeyPrompt?.message).toContain("https://poe.com/api_key");
    expect(apiKeyPrompt?.type).toBe("password");
  });

  it("shows credentials path when login runs in dry-run mode", async () => {
    const { prompt } = createPromptStub({});
    const logs: string[] = [];
    const program = createProgram({
      fs,
      prompts: prompt,
      env: { cwd, homeDir },
      logger: (message) => {
        logs.push(message);
      }
    });
    const credentialsPath = path.join(homeDir, ".poe-setup", "credentials.json");

    await program.parseAsync([
      "node",
      "cli",
      "--dry-run",
      "login",
      "--api-key",
      "dry-key"
    ]);

    expect(
      logs
    ).toContain(`Dry run: would store Poe API key at ${credentialsPath}.`);
    expect(
      logs
    ).toContain(
      `${chalk.green(`cat > ${credentialsPath}`)} ${chalk.dim("# create")}`
    );
  });

  it("prompts again after logout removes stored api key", async () => {
    const responses: Record<string, unknown> = { apiKey: "initial-key" };
    const promptStub = createPromptStub(responses);
    const commandRunnerStub = createCommandRunnerStub();
    const program = createProgram({
      fs,
      prompts: promptStub.prompt,
      env: { cwd, homeDir },
      logger: () => {},
      commandRunner: commandRunnerStub.runner
    });
    const credentialsPath = path.join(homeDir, ".poe-setup", "credentials.json");

    await program.parseAsync(["node", "cli", "login"]);
    await expect(fs.readFile(credentialsPath, "utf8")).resolves.toBeTruthy();

    await program.parseAsync(["node", "cli", "logout"]);
    await expect(fs.readFile(credentialsPath, "utf8")).rejects.toThrow();

    responses.apiKey = "prompted-key";

    await program.parseAsync(["node", "cli", "configure", "claude-code"]);

    const settings = await fs.readFile(
      path.join(homeDir, ".claude", "settings.json"),
      "utf8"
    );
    const parsed = JSON.parse(settings);
    expect(parsed).toEqual({
      apiKeyHelper: path.join(homeDir, ".claude", "anthropic_key.sh"),
      env: {
        ANTHROPIC_BASE_URL: "https://api.poe.com"
      }
    });

    const apiKeyPrompts = promptStub.calls.filter(
      (call) => call.name === "apiKey"
    );
    expect(apiKeyPrompts.length).toBeGreaterThanOrEqual(2);
  });

  it("writes claude settings json with env configuration", async () => {
    const responses: Record<string, unknown> = { apiKey: "claude-key" };
    const promptStub = createPromptStub(responses);
    const commandRunnerStub = createCommandRunnerStub();
    const program = createProgram({
      fs,
      prompts: promptStub.prompt,
      env: { cwd, homeDir },
      logger: () => {},
      commandRunner: commandRunnerStub.runner
    });
    await program.parseAsync(["node", "cli", "configure", "claude-code"]);

    const settings = await fs.readFile(
      path.join(homeDir, ".claude", "settings.json"),
      "utf8"
    );
    const parsed = JSON.parse(settings);
    expect(parsed).toEqual({
      apiKeyHelper: path.join(homeDir, ".claude", "anthropic_key.sh"),
      env: {
        ANTHROPIC_BASE_URL: "https://api.poe.com"
      }
    });
  });

  it("tests stored api key with the test command", async () => {
    const responses: Record<string, unknown> = {};
    const promptStub = createPromptStub(responses);
    const fetchCalls: Array<{
      url: string;
      init?: { method?: string; headers?: Record<string, string>; body?: string };
    }> = [];
    const fetchStub = async (
      url: string,
      init?: { method?: string; headers?: Record<string, string>; body?: string }
    ) => {
      fetchCalls.push({ url, init });
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: "Ping" } }]
        })
      };
    };
    const logs: string[] = [];
    const program = createProgram({
      fs,
      prompts: promptStub.prompt,
      env: { cwd, homeDir },
      logger: (message) => {
        logs.push(message);
      },
      httpClient: fetchStub
    });

    await program.parseAsync([
      "node",
      "cli",
      "login",
      "--api-key",
      "secret-key"
    ]);
    await program.parseAsync(["node", "cli", "test"]);

    expect(fetchCalls).toHaveLength(1);
    const [call] = fetchCalls;
    expect(call.url).toBe("https://api.poe.com/v1/chat/completions");
    expect(call.init?.method).toBe("POST");
    expect(call.init?.headers).toMatchObject({
      "Content-Type": "application/json",
      Authorization: "Bearer secret-key"
    });
    expect(JSON.parse(call.init?.body as string)).toEqual({
      model: "EchoBot",
      messages: [{ role: "user", content: "Ping" }]
    });
    expect(
      logs.find((line) => line.includes("Poe API key verified"))
    ).toBeTruthy();
  });

  it("runs claude-code before prerequisites standalone", async () => {
    const promptStub = createPromptStub({});
    const commandRunnerStub = createCommandRunnerStub();
    const logs: string[] = [];
    const program = createProgram({
      fs,
      prompts: promptStub.prompt,
      env: { cwd, homeDir },
      logger: (message) => {
        logs.push(message);
      },
      commandRunner: commandRunnerStub.runner
    });

    await program.parseAsync([
      "node",
      "cli",
      "--verbose",
      "prerequisites",
      "claude-code",
      "before"
    ]);

    // No before prerequisites registered, so it succeeds with no commands run
    expect(commandRunnerStub.calls).toEqual([]);
    expect(logs).toContain("Claude Code before prerequisites succeeded.");
  });

  it("runs claude-code after prerequisites standalone", async () => {
    const promptStub = createPromptStub({});
    const commandRunnerStub = createCommandRunnerStub();
    const logs: string[] = [];
    const program = createProgram({
      fs,
      prompts: promptStub.prompt,
      env: { cwd, homeDir },
      logger: (message) => {
        logs.push(message);
      },
      commandRunner: commandRunnerStub.runner
    });

    await program.parseAsync([
      "node",
      "cli",
      "--verbose",
      "prerequisites",
      "claude-code",
      "after"
    ]);

    expect(logs).toContain("Running after prerequisite: Claude CLI health check must succeed");
    expect(commandRunnerStub.calls.map((call) => call.command)).toEqual([
      "claude"
    ]);
    expect(
      logs.find((line) =>
        line.startsWith(
          "> claude -p Output exactly: CLAUDE_CODE_OK --allowedTools Bash,Read --permission-mode acceptEdits --output-format text"
        )
      )
    ).toBeTruthy();
    expect(logs).toContain("✓ Claude CLI health check must succeed");
    expect(logs).toContain("Claude Code after prerequisites succeeded.");
  });

  it("logs actions while configuring claude-code when verbose", async () => {
    const promptStub = createPromptStub({ apiKey: "prompted-key" });
    const commandRunnerStub = createCommandRunnerStub();
    const logs: string[] = [];
    const program = createProgram({
      fs,
      prompts: promptStub.prompt,
      env: { cwd, homeDir },
      logger: (message) => {
        logs.push(message);
      },
      commandRunner: commandRunnerStub.runner
    });
    await program.parseAsync([
      "node",
      "cli",
      "--verbose",
      "configure",
      "claude-code"
    ]);

    expect(logs).toContain(
      `${chalk.cyan("mkdir -p /home/user/.claude")} ${chalk.dim("# create")}`
    );
    expect(logs).toContain(
      `${chalk.green("cat > /home/user/.claude/settings.json")} ${chalk.dim("# create")}`
    );
    expect(
      logs.find((line) => line.startsWith("> claude -p Output exactly"))
    ).toBeTruthy();
    expect(logs).toContain(
      "Running after prerequisite: Claude CLI health check must succeed"
    );
    expect(logs).toContain("✓ Claude CLI health check must succeed");
    expect(logs).toContain("Configured Claude Code.");
  });

  it("does not log detailed actions when configuring claude-code without verbose", async () => {
    const promptStub = createPromptStub({ apiKey: "prompted-key" });
    const commandRunnerStub = createCommandRunnerStub();
    const logs: string[] = [];
    const program = createProgram({
      fs,
      prompts: promptStub.prompt,
      env: { cwd, homeDir },
      logger: (message) => {
        logs.push(message);
      },
      commandRunner: commandRunnerStub.runner
    });

    await program.parseAsync(["node", "cli", "configure", "claude-code"]);

    expect(
      logs.some((line) => line.includes("Ensure Claude settings directory"))
    ).toBe(false);
    expect(
      logs.some((line) => line.startsWith("Running before prerequisite"))
    ).toBe(false);
    expect(logs).toContain("Configured Claude Code.");
  });

  it("fails for unknown prerequisite phase", async () => {
    const promptStub = createPromptStub({});
    const commandRunnerStub = createCommandRunnerStub();
    const program = createProgram({
      fs,
      prompts: promptStub.prompt,
      env: { cwd, homeDir },
      logger: () => {},
      commandRunner: commandRunnerStub.runner
    });

    await expect(
      program.parseAsync([
        "node",
        "cli",
      "prerequisites",
        "claude-code",
        "invalid"
      ])
    ).rejects.toThrow('Unknown phase "invalid". Use "before" or "after".');
  });

  it("fails for unknown prerequisite service", async () => {
    const promptStub = createPromptStub({});
    const commandRunnerStub = createCommandRunnerStub();
    const program = createProgram({
      fs,
      prompts: promptStub.prompt,
      env: { cwd, homeDir },
      logger: () => {},
      commandRunner: commandRunnerStub.runner
    });

    await expect(
      program.parseAsync([
        "node",
        "cli",
        "prerequisites",
        "unknown-service",
        "before"
      ])
    ).rejects.toThrow('Unknown service "unknown-service".');
  });

  it("logs actions while removing claude-code when verbose", async () => {
    const promptStub = createPromptStub({});
    const commandRunnerStub = createCommandRunnerStub();
    const logs: string[] = [];
    const program = createProgram({
      fs,
      prompts: promptStub.prompt,
      env: { cwd, homeDir },
      logger: (message) => logs.push(message),
      commandRunner: commandRunnerStub.runner
    });
    const settingsPath = path.join(homeDir, ".claude", "settings.json");
    const helperPath = path.join(homeDir, ".claude", "anthropic_key.sh");
    await fs.mkdir(path.dirname(settingsPath), { recursive: true });
    await fs.writeFile(
      settingsPath,
      JSON.stringify(
        {
          apiKeyHelper: helperPath,
          env: {
            ANTHROPIC_BASE_URL: "https://api.poe.com"
          }
        },
        null,
        2
      ),
      { encoding: "utf8" }
    );
    await fs.writeFile(helperPath, CLAUDE_HELPER_CONTENT, { encoding: "utf8" });

    await program.parseAsync([
      "node",
      "cli",
      "--verbose",
      "remove",
      "claude-code"
    ]);

    expect(logs).toContain(
      `${chalk.red("rm /home/user/.claude/anthropic_key.sh")} ${chalk.dim("# delete")}`
    );
    expect(logs).toContain(
      `${chalk.red("rm /home/user/.claude/settings.json")} ${chalk.dim("# delete")}`
    );
    expect(logs).toContain("Removed Claude Code configuration.");
  });

  it("does not log detailed actions while removing claude-code without verbose", async () => {
    const promptStub = createPromptStub({});
    const commandRunnerStub = createCommandRunnerStub();
    const logs: string[] = [];
    const program = createProgram({
      fs,
      prompts: promptStub.prompt,
      env: { cwd, homeDir },
      logger: (message) => logs.push(message),
      commandRunner: commandRunnerStub.runner
    });
    const settingsPath = path.join(homeDir, ".claude", "settings.json");
    const helperPath = path.join(homeDir, ".claude", "anthropic_key.sh");
    await fs.mkdir(path.dirname(settingsPath), { recursive: true });
    await fs.writeFile(
      settingsPath,
      JSON.stringify(
        {
          apiKeyHelper: helperPath,
          env: {
            ANTHROPIC_BASE_URL: "https://api.poe.com"
          }
        },
        null,
        2
      ),
      { encoding: "utf8" }
    );
    await fs.writeFile(helperPath, CLAUDE_HELPER_CONTENT, { encoding: "utf8" });

    await program.parseAsync(["node", "cli", "remove", "claude-code"]);

  expect(
      logs.some((line) => line.includes("Prune Claude settings"))
    ).toBe(false);
    expect(logs).toContain("Removed Claude Code configuration.");
  });

  it("queries poe api with provided text and logs the response", async () => {
    const responses: Record<string, unknown> = {};
    const promptStub = createPromptStub(responses);
    const fetchCalls: Array<{
      url: string;
      init?: { method?: string; headers?: Record<string, string>; body?: string };
    }> = [];
    const fetchStub = async (
      url: string,
      init?: { method?: string; headers?: Record<string, string>; body?: string }
    ) => {
      fetchCalls.push({ url, init });
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: "Hello from Poe" } }]
        })
      };
    };
    const logs: string[] = [];
    const program = createProgram({
      fs,
      prompts: promptStub.prompt,
      env: { cwd, homeDir },
      logger: (message) => {
        logs.push(message);
      },
      httpClient: fetchStub
    });

    await program.parseAsync([
      "node",
      "cli",
      "login",
      "--api-key",
      "secret-key"
    ]);
    await program.parseAsync([
      "node",
      "cli",
      "query",
      "--model",
      "gpt-5",
      "Hello there"
    ]);

    expect(fetchCalls).toHaveLength(1);
    const [call] = fetchCalls;
    expect(call.url).toBe("https://api.poe.com/v1/chat/completions");
    expect(call.init?.method).toBe("POST");
    expect(call.init?.headers).toMatchObject({
      "Content-Type": "application/json",
      Authorization: "Bearer secret-key"
    });
    expect(JSON.parse(call.init?.body as string)).toEqual({
      model: "gpt-5",
      messages: [{ role: "user", content: "Hello there" }]
    });
    expect(logs).toContain("gpt-5: Hello from Poe");
  });

  it("queries poe api with the default model when none is provided", async () => {
    const responses: Record<string, unknown> = {};
    const promptStub = createPromptStub(responses);
    const fetchCalls: Array<{
      url: string;
      init?: { method?: string; headers?: Record<string, string>; body?: string };
    }> = [];
    const fetchStub = async (
      url: string,
      init?: { method?: string; headers?: Record<string, string>; body?: string }
    ) => {
      fetchCalls.push({ url, init });
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: "Response with default model" } }]
        })
      };
    };
    const logs: string[] = [];
    const program = createProgram({
      fs,
      prompts: promptStub.prompt,
      env: { cwd, homeDir },
      logger: (message) => {
        logs.push(message);
      },
      httpClient: fetchStub
    });

    await program.parseAsync([
      "node",
      "cli",
      "login",
      "--api-key",
      "default-model-key"
    ]);
    await program.parseAsync(["node", "cli", "query", "Hello there"]);

    expect(fetchCalls).toHaveLength(1);
    const [call] = fetchCalls;
    expect(JSON.parse(call.init?.body as string)).toEqual({
      model: "Claude-Sonnet-4.5",
      messages: [{ role: "user", content: "Hello there" }]
    });
    expect(logs).toContain("Claude-Sonnet-4.5: Response with default model");
  });

  it("does not call poe api when query runs in dry-run mode", async () => {
    const responses: Record<string, unknown> = {};
    const promptStub = createPromptStub(responses);
    const fetchCalls: Array<{
      url: string;
      init?: { method?: string; headers?: Record<string, string>; body?: string };
    }> = [];
    const fetchStub = async (
      url: string,
      init?: { method?: string; headers?: Record<string, string>; body?: string }
    ) => {
      fetchCalls.push({ url, init });
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: "unused" } }]
        })
      };
    };
    const logs: string[] = [];
    const program = createProgram({
      fs,
      prompts: promptStub.prompt,
      env: { cwd, homeDir },
      logger: (message) => {
        logs.push(message);
      },
      httpClient: fetchStub
    });

    await program.parseAsync(["node", "cli", "--dry-run", "query", "Hello there"]);

    expect(fetchCalls).toHaveLength(0);
    expect(
      logs.find((line) =>
        line.includes(
          'Dry run: would query "Claude-Sonnet-4.5" with text "Hello there".'
        )
      )
    ).toBeTruthy();
  });

  it("runs a single agent prompt through the CLI", async () => {
    const { prompt } = createPromptStub({});
    const logs: string[] = [];
    const chatStub = createChatServiceStub({
      content: "Completed the task.",
      model: "gpt-5"
    });
    const program = createProgram({
      fs,
      prompts: prompt,
      env: { cwd, homeDir },
      logger: (message) => {
        logs.push(message);
      },
      chatServiceFactory: chatStub.factory
    });

    await program.parseAsync([
      "node",
      "cli",
      "agent",
      "Review the latest logs",
      "--api-key",
      "sk-agent"
    ]);

    expect(chatStub.factory).toHaveBeenCalledTimes(1);
    expect(chatStub.calls).toEqual([
      {
        prompt: "Review the latest logs",
        options: {
          apiKey: "sk-agent",
          model: "Claude-Sonnet-4.5",
          cwd,
          homeDir
        }
      }
    ]);
    expect(logs).toContain(
      "Agent response (gpt-5): Completed the task."
    );

    const credentialsPath = path.join(
      homeDir,
      ".poe-setup",
      "credentials.json"
    );
    const stored = JSON.parse(await fs.readFile(credentialsPath, "utf8"));
    expect(stored.apiKey).toBe("sk-agent");
  });

  it("installs missing dependencies before configuring claude-code", async () => {
    const { prompt } = createPromptStub({ apiKey: "sk-install" });
    const logs: string[] = [];
    let hasClaudeCli = false;
    const commandCalls: CommandCall[] = [];
    const commandRunner = vi.fn(
      async (command: string, args: string[]) => {
        commandCalls.push({ command, args });
        // Handle all detection methods - they all check for claude binary
        if (command === "which" || command === "where") {
          if (args[0] === "claude") {
            if (hasClaudeCli) {
              return {
                stdout: "/usr/local/bin/claude\n",
                stderr: "",
                exitCode: 0
              };
            }
            return { stdout: "", stderr: "not found", exitCode: 1 };
          }
        }
        if (command === "test" || command === "ls") {
          // These check for file existence
          if (hasClaudeCli) {
            return { stdout: "", stderr: "", exitCode: 0 };
          }
          return { stdout: "", stderr: "not found", exitCode: 1 };
        }
        if (command === "npm" && args[0] === "install") {
          hasClaudeCli = true;
          return { stdout: "", stderr: "", exitCode: 0 };
        }
        if (command === "claude") {
          return {
            stdout: "CLAUDE_CODE_OK\n",
            stderr: "",
            exitCode: 0
          };
        }
        return { stdout: "", stderr: "", exitCode: 0 };
      }
    ) as unknown as CommandRunner;

    const program = createProgram({
      fs,
      prompts: prompt,
      env: { cwd, homeDir },
      logger: (line) => {
        logs.push(line);
      },
      commandRunner
    });

    await program.parseAsync([
      "node",
      "cli",
      "configure",
      "claude-code"
    ]);

    expect(
      commandCalls.some(
        (call) =>
          call.command === "npm" &&
          call.args.some((arg) => arg.includes("claude-code"))
      )
    ).toBe(true);
    expect(logs).toContain("Installed Claude CLI via npm.");

    const settings = JSON.parse(
      await fs.readFile(
        path.join(homeDir, ".claude", "settings.json"),
        "utf8"
      )
    );
    expect(settings).toEqual({
      apiKeyHelper: path.join(homeDir, ".claude", "anthropic_key.sh"),
      env: {
        ANTHROPIC_BASE_URL: "https://api.poe.com"
      }
    });
  });

  it("rejects unknown install option", async () => {
    const { prompt } = createPromptStub({ apiKey: "ignored-key" });
    const commandRunner = vi.fn(
      async (): Promise<{ stdout: string; stderr: string; exitCode: number }> => ({
        stdout: "",
        stderr: "",
        exitCode: 0
      })
    ) as unknown as CommandRunner;
    const program = createProgram({
      fs,
      prompts: prompt,
      env: { cwd, homeDir },
      logger: () => {},
      commandRunner
    });

    await expect(
      program.parseAsync([
        "node",
        "cli",
        "configure",
        "claude-code",
        "--install"
      ])
    ).rejects.toThrow(/unknown option '--install'/i);
  });

  it("spawns a claude-code agent with additional arguments", async () => {
    const { prompt } = createPromptStub({});
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
      prompts: prompt,
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
      "Explain the change",
      "--",
      "--output-format",
      "text"
    ]);

    expect(spawnSpy).toHaveBeenCalledWith({
      prompt: "Explain the change",
      args: ["--output-format", "text"],
      runCommand: expect.any(Function)
    });
    expect(logs).toContain("Agent output");
    spawnSpy.mockRestore();
  });

  it("spawns a codex agent", async () => {
    const { prompt } = createPromptStub({});
    const logs: string[] = [];
    const spawnSpy = vi.spyOn(codexService, "spawnCodex").mockResolvedValue({
      stdout: "Codex output\n",
      stderr: "",
      exitCode: 0
    });
    const program = createProgram({
      fs,
      prompts: prompt,
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
      "Summarize the diff",
      "--",
      "--output",
      "json"
    ]);

    expect(spawnSpy).toHaveBeenCalledWith({
      prompt: "Summarize the diff",
      args: ["--output", "json"],
      runCommand: expect.any(Function)
    });
    expect(logs).toContain("Codex output");
    spawnSpy.mockRestore();
  });

  it("spawns an opencode agent", async () => {
    const { prompt } = createPromptStub({});
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
      prompts: prompt,
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
      "List files",
      "--",
      "--format",
      "markdown"
    ]);

    expect(spawnSpy).toHaveBeenCalledWith({
      prompt: "List files",
      args: ["--format", "markdown"],
      runCommand: expect.any(Function)
    });
    expect(logs).toContain("OpenCode output");
    spawnSpy.mockRestore();
  });

  it("spawns a poe-code agent using the built-in agent command", async () => {
    const { prompt } = createPromptStub({});
    const logs: string[] = [];
    const chatFactory = vi.fn(async (options: any) => ({
      setToolCallCallback: vi.fn(),
      getModel: () => options.model,
      async sendMessage(message: string) {
        logs.push(`sent:${message}`);
        return { role: "assistant", content: "Poe output" };
      },
      dispose: vi.fn()
    }));
    const program = createProgram({
      fs,
      prompts: prompt,
      env: { cwd, homeDir },
      logger: (message) => {
        logs.push(message);
      },
      chatServiceFactory: chatFactory as any
    });

    await program.parseAsync([
      "node",
      "cli",
      "spawn",
      "poe-code",
      "Explain the prompt",
      "--",
      "--model",
      "GPT-5",
      "--api-key",
      "sk-explicit"
    ]);

    expect(chatFactory).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: "sk-explicit",
        model: "GPT-5",
        cwd,
        homeDir
      })
    );
    expect(logs.some((line) => line.includes("Poe Code response (GPT-5): Poe output"))).toBe(true);
  });

  it("fails when spawn command exits with error", async () => {
    const { prompt } = createPromptStub({});
    const spawnSpy = vi
      .spyOn(claudeService, "spawnClaudeCode")
      .mockResolvedValue({
        stdout: "",
        stderr: "spawn failed",
        exitCode: 1
      });
    const program = createProgram({
      fs,
      prompts: prompt,
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
    const { prompt } = createPromptStub({});
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
      prompts: prompt,
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

  it("rejects spawn for services without spawn support", async () => {
    const { prompt } = createPromptStub({});
    const program = createProgram({
      fs,
      prompts: prompt,
      env: { cwd, homeDir },
      logger: () => {}
    });

    await expect(
      program.parseAsync(["node", "cli", "spawn", "roo-code", "Hello"])
    ).rejects.toThrow(/does not support spawn/i);
  });
});
