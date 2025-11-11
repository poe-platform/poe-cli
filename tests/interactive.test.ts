import { beforeEach, describe, expect, it, vi } from "vitest";
import { Volume, createFsFromVolume } from "memfs";
import path from "node:path";
import type { FileSystem } from "../src/utils/file-system.js";
import type { CliDependencies } from "../src/cli/program.js";
import { createInteractiveCommandExecutor } from "../src/cli/interactive-command-runner.js";

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

describe("Interactive command executor", () => {
  let fs: FileSystem;
  let vol: Volume;
  const cwd = "/workspace";
  const homeDir = "/home/user";

  beforeEach(() => {
    ({ fs, vol } = createMemFs());
    vol.mkdirSync(cwd, { recursive: true });
    vol.mkdirSync(homeDir, { recursive: true });
  });

  async function createExecutor(overrides?: Partial<CliDependencies>) {
    const { prompt } = createPromptStub({});
    const logger = vi.fn();
    return createInteractiveCommandExecutor({
      fs,
      prompts: prompt,
      env: { cwd, homeDir, platform: "darwin" } as any,
      logger,
      ...overrides
    });
  }

  it("runs CLI commands through the interactive executor", async () => {
    const executor = await createExecutor();

    const parsed = executor.identify(
      "configure roo-code --api-key sk-test --config-name primary"
    );
    expect(parsed).toBeTruthy();
    const output = await executor.execute(parsed!);

    expect(output).toContain("Configured Roo Code.");

    const configPath = path.join(homeDir, "Documents", "roo-config.json");
    const config = JSON.parse(await fs.readFile(configPath, "utf8"));
    expect(config.providerProfiles.currentApiConfigName).toBe("primary");
    expect(config.providerProfiles.apiConfigs.primary.openAiApiKey).toBe("sk-test");
  });

  it("verifies API keys using the CLI test command", async () => {
    const httpClient = vi.fn(async () => ({
      ok: true,
      status: 200,
      async json() {
        return {
          choices: [
            {
              message: { content: "Ping" }
            }
          ]
        };
      }
    }));
    const executor = await createExecutor({ httpClient });

    const parsed = executor.identify("test --api-key sk-live");
    expect(parsed).toBeTruthy();
    const output = await executor.execute(parsed!);

    expect(httpClient).toHaveBeenCalledTimes(1);
    expect(output).toContain("Poe API key verified via EchoBot.");

    const credentialsPath = path.join(
      homeDir,
      ".poe-code",
      "credentials.json"
    );
    const stored = JSON.parse(await fs.readFile(credentialsPath, "utf8"));
    expect(stored.apiKey).toBe("sk-live");
  });

  it("shows CLI help when help command is used", async () => {
    const executor = await createExecutor();

    const parsed = executor.identify("help");
    expect(parsed).toBeTruthy();

    const output = await executor.execute(parsed!);
    expect(output).toContain("Usage: poe-code");
  });
});
