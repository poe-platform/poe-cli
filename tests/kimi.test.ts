import { describe, it, expect, beforeEach, vi } from "vitest";
import { Volume, createFsFromVolume } from "memfs";
import path from "node:path";
import type { FileSystem } from "../src/utils/file-system.js";
import { DEFAULT_KIMI_MODEL, KIMI_MODELS, PROVIDER_NAME } from "../src/cli/constants.js";
import * as kimiService from "../src/providers/kimi.js";
import { createCliEnvironment } from "../src/cli/environment.js";
import { createTestCommandContext } from "./test-command-context.js";
import type { ProviderContext } from "../src/cli/service-registry.js";
import { createLoggerFactory } from "../src/cli/logger.js";

function createMemFs(): { fs: FileSystem; vol: Volume } {
  const vol = new Volume();
  const fs = createFsFromVolume(vol);
  return { fs: fs.promises as unknown as FileSystem, vol };
}

const withProviderPrefix = (model: string): string => `${PROVIDER_NAME}/${model}`;

const expectedKimiModels = KIMI_MODELS.reduce<Record<string, { name: string }>>((acc, id) => {
  acc[id] = { name: id };
  return acc;
}, {});

const DEFAULT_PROVIDER_MODEL = withProviderPrefix(DEFAULT_KIMI_MODEL);

describe("kimi service", () => {
  let fs: FileSystem;
  let vol: Volume;
  const homeDir = "/home/user";
  const configPath = path.join(homeDir, ".config", "kimi", "config.json");
  const authPath = path.join(homeDir, ".local", "share", "kimi", "auth.json");
  let env = createCliEnvironment({ cwd: homeDir, homeDir });

  beforeEach(() => {
    ({ fs, vol } = createMemFs());
    vol.mkdirSync(homeDir, { recursive: true });
    env = createCliEnvironment({ cwd: homeDir, homeDir });
  });

  function createProviderTestContext(
    runCommand: ReturnType<typeof vi.fn>,
    options: { dryRun?: boolean } = {}
  ): { context: ProviderContext; logs: string[] } {
    const logs: string[] = [];
    const logger = createLoggerFactory((message) => {
      logs.push(message);
    }).create({
      dryRun: options.dryRun ?? false,
      verbose: true,
      scope: "test:kimi"
    });

    const context = {
      env,
      paths: {},
      command: {
        runCommand,
        fs
      },
      logger,
      async runCheck(check) {
        await check.run({
          isDryRun: logger.context.dryRun,
          runCommand,
          logDryRun: (message) => logger.dryRun(message)
        });
      }
    } as ProviderContext;

    return { context, logs };
  }

  type ConfigureOptions = Parameters<typeof kimiService.kimiService.configure>[0]["options"];

  const buildConfigureOptions = (overrides: Partial<ConfigureOptions> = {}): ConfigureOptions => ({
    env,
    apiKey: "sk-test",
    model: DEFAULT_KIMI_MODEL,
    ...overrides
  });

  async function configureKimi(overrides: Partial<ConfigureOptions> = {}): Promise<void> {
    await kimiService.kimiService.configure({
      fs,
      env,
      command: createTestCommandContext(fs),
      options: buildConfigureOptions(overrides)
    });
  }

  it("creates the kimi config and auth files", async () => {
    await configureKimi();

    const config = JSON.parse(await fs.readFile(configPath, "utf8"));
    expect(config).toEqual({
      $schema: "https://kimi.ai/config.json",
      model: DEFAULT_PROVIDER_MODEL,
      provider: {
        [PROVIDER_NAME]: {
          npm: "@ai-sdk/openai-compatible",
          name: "poe.com",
          options: {
            baseURL: "https://api.poe.com/v1"
          },
          models: expectedKimiModels
        }
      }
    });

    const auth = JSON.parse(await fs.readFile(authPath, "utf8"));
    expect(auth).toEqual({
      [PROVIDER_NAME]: {
        type: "api",
        key: "sk-test"
      }
    });
  });

  it("writes the selected kimi model to the config", async () => {
    const alternate = KIMI_MODELS[KIMI_MODELS.length - 1]!;
    await configureKimi({ model: alternate });

    const config = JSON.parse(await fs.readFile(configPath, "utf8"));
    expect(config.model).toBe(withProviderPrefix(alternate));
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

    await configureKimi();

    const config = JSON.parse(await fs.readFile(configPath, "utf8"));
    expect(config.provider.local).toEqual({
      name: "local",
      models: ["foo"]
    });
    expect(config.provider[PROVIDER_NAME]).toMatchObject({
      npm: "@ai-sdk/openai-compatible",
      models: expectedKimiModels
    });
    expect(config.$schema).toBe("https://kimi.ai/config.json");
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

    await configureKimi();

    const auth = JSON.parse(await fs.readFile(authPath, "utf8"));
    expect(auth).toEqual({
      [PROVIDER_NAME]: {
        type: "api",
        key: "sk-test"
      },
      openai: {
        type: "api",
        key: "openai-key"
      }
    });
  });

  it("spawns the kimi CLI with the provided prompt and args", async () => {
    const runCommand = vi.fn(async () => ({
      stdout: "kimi-output\n",
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
        context: { dryRun: false, verbose: true }
      }
    } as unknown as import("../src/cli/service-registry.js").ProviderContext;

    const result = await kimiService.kimiService.spawn(providerContext, {
      prompt: "List all files",
      args: ["--format", "markdown"]
    });

    expect(runCommand).toHaveBeenCalledWith("kimi", [
      "--model",
      DEFAULT_PROVIDER_MODEL,
      "run",
      "List all files",
      "--format",
      "markdown"
    ]);
    expect(result).toEqual({
      stdout: "kimi-output\n",
      stderr: "",
      exitCode: 0
    });
  });

  it("spawns the kimi CLI with a custom model", async () => {
    const runCommand = vi.fn(async () => ({
      stdout: "kimi-output\n",
      stderr: "",
      exitCode: 0
    }));
    const customModel = KIMI_MODELS[KIMI_MODELS.length - 1]!;
    const providerContext = {
      env: {} as any,
      paths: {},
      command: {
        runCommand,
        fs
      },
      logger: {
        context: { dryRun: false, verbose: true }
      }
    } as unknown as import("../src/cli/service-registry.js").ProviderContext;

    await kimiService.kimiService.spawn(providerContext, {
      prompt: "List all files",
      model: customModel
    });

    expect(runCommand).toHaveBeenCalledWith("kimi", [
      "--model",
      withProviderPrefix(customModel),
      "run",
      "List all files"
    ]);
  });

  it("avoids duplicating the provider prefix for prefixed models", async () => {
    const runCommand = vi.fn(async () => ({
      stdout: "kimi-output\n",
      stderr: "",
      exitCode: 0
    }));
    const prefixed = withProviderPrefix("Custom-Model");
    const providerContext = {
      env: {} as any,
      paths: {},
      command: {
        runCommand,
        fs
      },
      logger: {
        context: { dryRun: false, verbose: true }
      },
      async runCheck(check) {
        await check.run({
          isDryRun: false,
          runCommand,
          logDryRun: () => {}
        });
      }
    } as ProviderContext;

    await kimiService.kimiService.spawn(providerContext, {
      prompt: "Describe the change",
      model: prefixed
    });

    expect(runCommand).toHaveBeenCalledWith("kimi", [
      "--model",
      prefixed,
      "run",
      "Describe the change"
    ]);
  });

  it("runs the Kimi health check when test is invoked", async () => {
    const runCommand = vi.fn(async () => ({
      stdout: "KIMI_OK\n",
      stderr: "",
      exitCode: 0
    }));
    const { context } = createProviderTestContext(runCommand);

    await kimiService.kimiService.test?.(context);

    expect(runCommand).toHaveBeenCalledWith("kimi", [
      "--model",
      DEFAULT_PROVIDER_MODEL,
      "run",
      "Output exactly: KIMI_OK"
    ]);
  });

  it("skips the Kimi health check during dry runs", async () => {
    const runCommand = vi.fn();
    const { context, logs } = createProviderTestContext(runCommand, {
      dryRun: true
    });

    await kimiService.kimiService.test?.(context);

    expect(runCommand).not.toHaveBeenCalled();
    expect(
      logs.find((line) =>
        line.includes(`kimi --model ${DEFAULT_PROVIDER_MODEL} run "Output exactly: KIMI_OK"`)
      )
    ).toBeTruthy();
  });

  it("includes stdout and stderr when the Kimi health check command fails", async () => {
    const runCommand = vi.fn(async () => ({
      stdout: "KIMI_FAIL_STDOUT\n",
      stderr: "KIMI_FAIL_STDERR\n",
      exitCode: 1
    }));
    const { context } = createProviderTestContext(runCommand);

    await expect(kimiService.kimiService.test?.(context)).rejects.toThrow(/KIMI_FAIL_STDOUT/);
  });

  it("includes stdout and stderr when the Kimi health check output is unexpected", async () => {
    const runCommand = vi.fn(async () => ({
      stdout: "MISCONFIG\n",
      stderr: "ALERT\n",
      exitCode: 0
    }));
    const { context } = createProviderTestContext(runCommand);

    await expect(kimiService.kimiService.test?.(context)).rejects.toThrow(
      /expected "KIMI_OK" but received "MISCONFIG"/i
    );
  });
});
