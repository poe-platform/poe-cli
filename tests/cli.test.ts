import { describe, it, expect, beforeEach } from "vitest";
import { Volume, createFsFromVolume } from "memfs";
import path from "node:path";
import type { FileSystem } from "../src/utils/file-system.js";
import { createProgram } from "../src/cli/program.js";

interface PromptCall {
  name: string;
  message?: string;
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
    const program = createProgram({
      fs,
      prompts: promptStub.prompt,
      env: { cwd, homeDir },
      logger: () => {}
    });

    await fs.writeFile(path.join(homeDir, ".bashrc"), "# env", {
      encoding: "utf8"
    });

    await program.parseAsync(["node", "cli", "configure", "claude-code"]);

    const bashrc = await fs.readFile(path.join(homeDir, ".bashrc"), "utf8");
    expect(bashrc).toContain('export POE_API_KEY="prompted-key"');
    expect(promptStub.calls.map((c) => c.name)).toContain("apiKey");
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
});
