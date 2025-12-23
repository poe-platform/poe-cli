import { describe, it, expect, vi, beforeEach } from "vitest";
import { createCliContainer } from "../src/cli/container.js";
import type { FileSystem } from "../src/utils/file-system.js";
import { createHomeFs } from "./test-helpers.js";
import { ensureIsolatedConfigForService } from "../src/cli/commands/ensure-isolated-config.js";

const cwd = "/repo";
const homeDir = "/home/test";

describe("ensureIsolatedConfigForService", () => {
  let fs: FileSystem;

  beforeEach(() => {
    fs = createHomeFs(homeDir);
  });

  it("creates Codex isolated config without touching ~/.codex", async () => {
    const container = createCliContainer({
      fs,
      prompts: vi.fn().mockResolvedValue({}),
      env: { cwd, homeDir },
      logger: () => {},
      commandRunner: vi.fn(async () => ({ stdout: "", stderr: "", exitCode: 0 }))
    });

    vi.spyOn(container.options, "resolveApiKey").mockResolvedValue("sk-test");
    vi.spyOn(container.options, "resolveModel").mockImplementation(
      async ({ defaultValue }) => defaultValue
    );
    vi.spyOn(container.options, "resolveReasoning").mockImplementation(
      async ({ defaultValue }) => defaultValue
    );

    const adapter = container.registry.require("codex");

    await ensureIsolatedConfigForService({
      container,
      adapter,
      service: "codex",
      flags: { dryRun: false, assumeYes: true }
    });

    await expect(
      fs.stat(`${homeDir}/.poe-code/codex/config.toml`)
    ).resolves.toBeTruthy();
    await expect(
      fs.stat(`${homeDir}/.codex/config.toml`)
    ).rejects.toBeTruthy();
  });

  it("creates OpenCode isolated config without touching ~/.config/opencode", async () => {
    const container = createCliContainer({
      fs,
      prompts: vi.fn().mockResolvedValue({}),
      env: { cwd, homeDir },
      logger: () => {},
      commandRunner: vi.fn(async () => ({ stdout: "", stderr: "", exitCode: 0 }))
    });

    vi.spyOn(container.options, "resolveApiKey").mockResolvedValue("sk-test");
    vi.spyOn(container.options, "resolveModel").mockImplementation(
      async ({ defaultValue }) => defaultValue
    );

    const adapter = container.registry.require("opencode");

    await ensureIsolatedConfigForService({
      container,
      adapter,
      service: "opencode",
      flags: { dryRun: false, assumeYes: true }
    });

    await expect(
      fs.stat(`${homeDir}/.poe-code/opencode/.config/opencode/config.json`)
    ).resolves.toBeTruthy();
    await expect(
      fs.stat(`${homeDir}/.config/opencode/config.json`)
    ).rejects.toBeTruthy();
  });
});
