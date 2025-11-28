import { describe, it, expect } from "vitest";
import { Volume, createFsFromVolume } from "memfs";
import { createCliEnvironment } from "../src/cli/environment.js";
import { createLoggerFactory } from "../src/cli/logger.js";
import { createProvider } from "../src/providers/create-provider.js";
import {
  ensureDirectory,
  jsonMergeMutation
} from "../src/services/service-manifest.js";
import { createTestCommandContext } from "./test-command-context.js";
import type { FileSystem } from "../src/utils/file-system.js";

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
});
