import { describe, it, expect, beforeEach, vi } from "vitest";
import { Volume, createFsFromVolume } from "memfs";
import path from "node:path";
import type { FileSystem } from "../src/utils/file-system.js";
import { createProgram } from "../src/cli/program.js";
import type { CommandRunner } from "../src/utils/prerequisites.js";

interface PromptCall {
  name: string;
  message?: string;
}

interface CommandCall {
  command: string;
  args: string[];
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
      calls.push({ name: q.name, message: q.message });
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

describe("CLI program", () => {
  let fs: FileSystem;
  let vol: Volume;
  const cwd = "/workspace";
  const homeDir = "/home/user";

  beforeEach(() => {
    ({ fs, vol } = createMemFs());
    vol.mkdirSync(cwd, { recursive: true });
    vol.mkdirSync(homeDir, { recursive: true });
  });

  it("exposes poe-cli as the command name", () => {
    const { prompt } = createPromptStub({});
    const program = createProgram({
      fs,
      prompts: prompt,
      env: { cwd, homeDir },
      logger: () => {}
    });

    expect(program.name()).toBe("poe-cli");
  });

  it("prepares placeholder package using publish-placeholder command", async () => {
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

    await program.parseAsync([
      "node",
      "cli",
      "publish-placeholder",
      "--output",
      "placeholder"
    ]);

    const manifest = await fs.readFile(
      path.join(cwd, "placeholder", "package.json"),
      "utf8"
    );
    expect(JSON.parse(manifest).name).toBe("poe-cli");
    expect(
      logs.find((line) => line.includes("Placeholder package ready"))
    ).toBeTruthy();
  });

  it("simulates commands without writing when using --dry-run", async () => {
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
    expect(
      logs.find((line) =>
        line.includes("write /home/user/.codex/config.toml")
      )
    ).toBeTruthy();

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
    expect(
      logs.find((line) => line.includes("write /workspace/demo/.env"))
    ).toBeTruthy();
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

    await fs.writeFile(path.join(homeDir, ".bashrc"), "# env", {
      encoding: "utf8"
    });

    await program.parseAsync(["node", "cli", "configure", "claude-code"]);

    const settings = await fs.readFile(
      path.join(homeDir, ".claude", "settings.json"),
      "utf8"
    );
    expect(JSON.parse(settings)).toEqual({
      env: {
        POE_API_KEY: "prompted-key",
        ANTHROPIC_BASE_URL: "https://api.poe.com",
      ANTHROPIC_API_KEY: "prompted-key"
      }
    });

    const bashrc = await fs.readFile(path.join(homeDir, ".bashrc"), "utf8");
    expect(bashrc).toBe("# env");
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
      args: ["-p", "Output exactly: CLAUDE_CODE_OK", "--output-format", "text"]
    });
  });

  it("fails when the claude binary is missing", async () => {
    const promptStub = createPromptStub({ apiKey: "prompted-key" });
    const commandRunnerStub = createCommandRunnerStub({ whichExitCode: 1 });
    const program = createProgram({
      fs,
      prompts: promptStub.prompt,
      env: { cwd, homeDir },
      logger: () => {},
      commandRunner: commandRunnerStub.runner
    });

    await expect(
      program.parseAsync(["node", "cli", "configure", "claude-code"])
    ).rejects.toThrow(/Claude CLI binary not found/);
    expect(commandRunnerStub.calls).toEqual([
      { command: "which", args: ["claude"] }
    ]);
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

    await fs.writeFile(path.join(homeDir, ".bashrc"), "# env", {
      encoding: "utf8"
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
      args: ["-p", "Output exactly: CLAUDE_CODE_OK", "--output-format", "text"]
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

    await fs.writeFile(path.join(homeDir, ".bashrc"), "# env", {
      encoding: "utf8"
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
      "claude:-p Output exactly: CLAUDE_CODE_OK --output-format text",
      "which:claude",
      "claude:-p Output exactly: CLAUDE_CODE_OK --output-format text"
    ]);
  });

  it("removes codex configuration", async () => {
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
    const bashrcPath = path.join(homeDir, ".bashrc");
    const credentialsPath = path.join(homeDir, ".poe-cli", "credentials.json");

    await fs.writeFile(bashrcPath, "# env", { encoding: "utf8" });

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
    const bashrcPath = path.join(homeDir, ".bashrc");
    const credentialsPath = path.join(homeDir, ".poe-cli", "credentials.json");

    await fs.writeFile(bashrcPath, "# env", { encoding: "utf8" });

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
    const credentialsPath = path.join(homeDir, ".poe-cli", "credentials.json");
    const bashrcPath = path.join(homeDir, ".bashrc");

    await fs.writeFile(bashrcPath, "# env", { encoding: "utf8" });

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
    expect(JSON.parse(settings)).toEqual({
      env: {
        POE_API_KEY: "stored-key",
        ANTHROPIC_BASE_URL: "https://api.poe.com",
        ANTHROPIC_API_KEY: "stored-key"
      }
    });

    const bashrc = await fs.readFile(bashrcPath, "utf8");
    expect(bashrc).toBe("# env");
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
    const credentialsPath = path.join(homeDir, ".poe-cli", "credentials.json");

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
      logs.find((line) =>
        line.includes(`write ${credentialsPath}`)
      )
    ).toBeTruthy();
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
    const credentialsPath = path.join(homeDir, ".poe-cli", "credentials.json");
    const bashrcPath = path.join(homeDir, ".bashrc");

    await fs.writeFile(bashrcPath, "# env", { encoding: "utf8" });

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
    expect(JSON.parse(settings)).toEqual({
      env: {
        POE_API_KEY: "prompted-key",
        ANTHROPIC_BASE_URL: "https://api.poe.com",
        ANTHROPIC_API_KEY: "prompted-key"
      }
    });

    const bashrc = await fs.readFile(bashrcPath, "utf8");
    expect(bashrc).toBe("# env");

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
    const bashrcPath = path.join(homeDir, ".bashrc");

    await fs.writeFile(bashrcPath, "# env", { encoding: "utf8" });
    await program.parseAsync(["node", "cli", "configure", "claude-code"]);

    const settings = await fs.readFile(
      path.join(homeDir, ".claude", "settings.json"),
      "utf8"
    );
    expect(JSON.parse(settings)).toEqual({
      env: {
        POE_API_KEY: "claude-key",
        ANTHROPIC_BASE_URL: "https://api.poe.com",
        ANTHROPIC_API_KEY: "claude-key"
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
});
