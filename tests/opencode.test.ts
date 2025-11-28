import { describe, it, expect, beforeEach, vi } from "vitest";
import { Volume, createFsFromVolume } from "memfs";
import path from "node:path";
import type { FileSystem } from "../src/utils/file-system.js";
import * as opencodeService from "../src/providers/opencode.js";
import { createPrerequisiteManager } from "../src/utils/prerequisites.js";
import { createCliEnvironment } from "../src/cli/environment.js";

function createMemFs(): { fs: FileSystem; vol: Volume } {
  const vol = new Volume();
  const fs = createFsFromVolume(vol);
  return { fs: fs.promises as unknown as FileSystem, vol };
}

function registerAfterHooks(
  service: typeof opencodeService.openCodeService,
  manager: ReturnType<typeof createPrerequisiteManager>
): void {
  service.hooks?.after?.forEach((hook) => manager.registerAfter(hook));
}

describe("opencode service", () => {
  let fs: FileSystem;
  let vol: Volume;
  const homeDir = "/home/user";
  const configPath = path.join(homeDir, ".config", "opencode", "config.json");
  const authPath = path.join(
    homeDir,
    ".local",
    "share",
    "opencode",
    "auth.json"
  );
  let env = createCliEnvironment({ cwd: homeDir, homeDir });

  beforeEach(() => {
    ({ fs, vol } = createMemFs());
    vol.mkdirSync(homeDir, { recursive: true });
    env = createCliEnvironment({ cwd: homeDir, homeDir });
  });

  type ConfigureOptions = Parameters<
    typeof opencodeService.openCodeService.configure
  >[0]["options"];

  const buildConfigureOptions = (
    overrides: Partial<ConfigureOptions> = {}
  ): ConfigureOptions => ({
    env,
    apiKey: "sk-test",
    ...overrides
  });

  async function configureOpenCode(
    overrides: Partial<ConfigureOptions> = {}
  ): Promise<void> {
    await opencodeService.openCodeService.configure({
      fs,
      env,
      options: buildConfigureOptions(overrides)
    });
  }

  it("creates the opencode config and auth files", async () => {
    await configureOpenCode();

    const config = JSON.parse(await fs.readFile(configPath, "utf8"));
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
            "GPT-5.1-Codex": {
              name: "GPT-5.1-Codex"
            }
          }
        }
      }
    });

    const auth = JSON.parse(await fs.readFile(authPath, "utf8"));
    expect(auth).toEqual({
      poe: {
        type: "api",
        key: "sk-test"
      }
    });
  });

  it("merges with existing config and preserves other providers", async () => {
    await fs.mkdir(path.dirname(configPath), { recursive: true });
    await fs.writeFile(
      configPath,
      JSON.stringify(
        {
          provider: {
            local: {
              name: "local",
              models: ["foo"]
            }
          }
        },
        null,
        2
      )
    );

    await configureOpenCode();

    const config = JSON.parse(await fs.readFile(configPath, "utf8"));
    expect(config.provider.local).toEqual({
      name: "local",
      models: ["foo"]
    });
    expect(config.provider.poe).toMatchObject({
      npm: "@ai-sdk/openai-compatible",
      models: {
        "Claude-Sonnet-4.5": {
          name: "Claude Sonnet 4.5"
        }
      }
    });
    expect(config.$schema).toBe("https://opencode.ai/config.json");
  });

  it("replaces the Poe auth entry while keeping other providers", async () => {
    await fs.mkdir(path.dirname(authPath), { recursive: true });
    await fs.writeFile(
      authPath,
      JSON.stringify(
        {
          poe: {
            type: "legacy",
            key: "old-key"
          },
          openai: {
            type: "api",
            key: "openai-key"
          }
        },
        null,
        2
      )
    );

    await configureOpenCode();

    const auth = JSON.parse(await fs.readFile(authPath, "utf8"));
    expect(auth).toEqual({
      poe: {
        type: "api",
        key: "sk-test"
      },
      openai: {
        type: "api",
        key: "openai-key"
      }
    });
  });

  it("spawns the opencode CLI with the provided prompt and args", async () => {
    const runCommand = vi.fn(async () => ({
      stdout: "opencode-output\n",
      stderr: "",
      exitCode: 0
    }));
    const providerContext = {
      env: {} as any,
      paths: {},
      command: {
        runCommand,
        fs
      },
      logger: {
        context: { dryRun: false, verbose: false }
      }
    } as unknown as import("../src/cli/service-registry.js").ProviderContext;

    const result = await opencodeService.openCodeService.spawn(providerContext, {
      prompt: "List all files",
      args: ["--format", "markdown"]
    });

    expect(runCommand).toHaveBeenCalledWith("opencode", [
      "run",
      "List all files",
      "--format",
      "markdown"
    ]);
    expect(result).toEqual({
      stdout: "opencode-output\n",
      stderr: "",
      exitCode: 0
    });
  });

  it("registers prerequisite checks for the OpenCode CLI", async () => {
    const calls: Array<{ command: string; args: string[] }> = [];
    const runCommand = vi.fn(async (command: string, args: string[]) => {
      calls.push({ command, args });
      if (command === "opencode") {
        return { stdout: "OPEN_CODE_OK\n", stderr: "", exitCode: 0 };
      }
      return { stdout: "", stderr: "", exitCode: 0 };
    });
    const manager = createPrerequisiteManager({
      isDryRun: false,
      runCommand
    });

    registerAfterHooks(opencodeService.openCodeService, manager);
    await manager.run("after");

    expect(calls.map((entry) => entry.command)).toEqual(["opencode"]);
    expect(calls[0]).toEqual({
      command: "opencode",
      args: ["run", "Output exactly: OPEN_CODE_OK"]
    });
  });

  it("includes stdout and stderr when the OpenCode health check command fails", async () => {
    const runCommand = vi.fn(async () => ({
      stdout: "OPEN_FAIL_STDOUT\n",
      stderr: "OPEN_FAIL_STDERR\n",
      exitCode: 1
    }));
    const manager = createPrerequisiteManager({
      isDryRun: false,
      runCommand
    });

    registerAfterHooks(opencodeService.openCodeService, manager);

    let caught: Error | undefined;
    try {
      await manager.run("after");
    } catch (error) {
      caught = error as Error;
    }

    expect(caught).toBeDefined();
    expect(caught?.message).toContain("stdout:\nOPEN_FAIL_STDOUT\n");
    expect(caught?.message).toContain("stderr:\nOPEN_FAIL_STDERR\n");
  });

  it("includes stdout and stderr when the OpenCode health check output is unexpected", async () => {
    const runCommand = vi.fn(async () => ({
      stdout: "MISCONFIG\n",
      stderr: "ALERT\n",
      exitCode: 0
    }));
    const manager = createPrerequisiteManager({
      isDryRun: false,
      runCommand
    });

    registerAfterHooks(opencodeService.openCodeService, manager);

    let caught: Error | undefined;
    try {
      await manager.run("after");
    } catch (error) {
      caught = error as Error;
    }

    expect(caught).toBeDefined();
    expect(caught?.message).toContain('expected "OPEN_CODE_OK" but received "MISCONFIG"');
    expect(caught?.message).toContain("stdout:\nMISCONFIG\n");
    expect(caught?.message).toContain("stderr:\nALERT\n");
  });
});
