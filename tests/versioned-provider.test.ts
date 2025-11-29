import { describe, it, expect, vi } from "vitest";
import { Volume, createFsFromVolume } from "memfs";
import { createCliEnvironment } from "../src/cli/environment.js";
import { createLoggerFactory } from "../src/cli/logger.js";
import { createProvider } from "../src/providers/create-provider.js";
import { createBinaryVersionResolver } from "../src/providers/versioned-provider.js";
import {
  ensureDirectory,
  jsonMergeMutation
} from "../src/services/service-manifest.js";
import { createTestCommandContext } from "./test-command-context.js";
import type { FileSystem } from "../src/utils/file-system.js";
import type { ProviderContext } from "../src/cli/service-registry.js";

type DemoConfigure = { env: ReturnType<typeof createCliEnvironment> };

function createFs(): FileSystem {
  const vol = new Volume();
  return createFsFromVolume(vol).promises as unknown as FileSystem;
}

function createContext(fs: FileSystem) {
  const env = createCliEnvironment({ cwd: "/repo", homeDir: "/home/user" });
  const command = createTestCommandContext(fs);
  const logger = createLoggerFactory(() => {}).create({ scope: "test" });
  return {
    provider: {
      env,
      paths: {},
      command,
      logger
    },
    service: {
      fs,
      env,
      command,
      options: { env }
    }
  };
}

describe("versioned manifest providers", () => {
  it("selects manifest matching resolved version", async () => {
    const fs = createFs();
    const provider = createProvider<Record<string, string>, DemoConfigure>({
      name: "demo",
      label: "Demo",
      id: "demo",
      summary: "Demo manifest",
      manifest: {
        "<2.0.0": {
          configure: [
            ensureDirectory({ path: "~/.demo" }),
            jsonMergeMutation({
              target: "~/.demo/config.json",
              value: () => ({ version: "legacy" })
            })
          ]
        },
        "*": {
          configure: [
            ensureDirectory({ path: "~/.demo" }),
            jsonMergeMutation({
              target: "~/.demo/config.json",
              value: () => ({ version: "modern" })
            })
          ]
        }
      },
      versionResolver: async () => "1.5.0"
    });
    const ctx = createContext(fs);
    const resolution = await provider.resolveVersion!(ctx.provider);
    await resolution.adapter.configure(ctx.service as any);
    const written = JSON.parse(
      await fs.readFile("/home/user/.demo/config.json", "utf8")
    );
    expect(written.version).toBe("legacy");
  });

  it("falls back to wildcard manifest when detection fails", async () => {
    const fs = createFs();
    const provider = createProvider<Record<string, string>, DemoConfigure>({
      name: "demo",
      label: "Demo",
      id: "demo",
      summary: "Demo manifest",
      manifest: {
        "*": {
          configure: [
            ensureDirectory({ path: "~/.demo" }),
            jsonMergeMutation({
              target: "~/.demo/config.json",
              value: () => ({ version: "wildcard" })
            })
          ]
        }
      },
      versionResolver: async () => {
        throw new Error("boom");
      }
    });
    const ctx = createContext(fs);
    const resolution = await provider.resolveVersion!(ctx.provider);
    expect(resolution.version).toBeNull();
    await resolution.adapter.configure(ctx.service as any);
    const written = JSON.parse(
      await fs.readFile("/home/user/.demo/config.json", "utf8")
    );
    expect(written.version).toBe("wildcard");
  });

  it("logs the detected binary version", async () => {
    const fs = createFs();
    const command = createTestCommandContext(fs);
    const runCommand = vi.fn(async () => ({
      stdout: "demo 2.5.1",
      stderr: "",
      exitCode: 0
    }));
    command.runCommand = runCommand;
    const logs: string[] = [];
    const logger = createLoggerFactory((message) => {
      logs.push(message);
    }).create({ scope: "test", verbose: true });
    const resolver = createBinaryVersionResolver("demo");
    const env = createCliEnvironment({ cwd: "/repo", homeDir: "/home/user" });
    const context: ProviderContext = {
      env,
      paths: {},
      command,
      logger,
      async runCheck(check) {
        await check.run({
          isDryRun: logger.context.dryRun,
          runCommand: command.runCommand,
          logDryRun: (message) => logger.dryRun(message)
        });
      }
    };

    const version = await resolver(context);

    expect(version).toBe("2.5.1");
    expect(
      logs.some((line) =>
        line.includes("Detected demo version 2.5.1") &&
        line.includes("demo 2.5.1")
      )
    ).toBe(true);
  });
});
