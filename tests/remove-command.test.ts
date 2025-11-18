import { describe, it, expect, vi, afterEach } from "vitest";
import { Command } from "commander";
import { Volume, createFsFromVolume } from "memfs";
import { createCliContainer } from "../src/cli/container.js";
import type { FileSystem } from "../src/utils/file-system.js";
import type { ProviderAdapter } from "../src/cli/service-registry.js";
import { registerRemoveCommand } from "../src/cli/commands/remove.js";
import { DEFAULT_ROO_CONFIG_NAME } from "../src/cli/constants.js";

const cwd = "/repo";
const homeDir = "/home/test";

function createMemFs(): FileSystem {
  const vol = new Volume();
  vol.mkdirSync(homeDir, { recursive: true });
  return createFsFromVolume(vol).promises as unknown as FileSystem;
}

function createBaseProgram(): Command {
  const program = new Command();
  program
    .name("poe-code")
    .option("-y, --yes")
    .option("--dry-run")
    .option("--verbose")
    .exitOverride();
  return program;
}

describe("remove command", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("invokes provider remove and reports the result", async () => {
    const fs = createMemFs();
    const logs: string[] = [];
    const container = createCliContainer({
      fs,
      prompts: vi.fn().mockResolvedValue({}),
      env: { cwd, homeDir },
      logger: (message) => {
        logs.push(message);
      }
    });

    const removeSpy = vi.fn().mockResolvedValue(true);

    const adapter: ProviderAdapter = {
      name: "test-service",
      label: "Test Service",
      resolvePaths() {
        return {};
      },
      async remove(context, options: { mutationHooks?: unknown }) {
        void context;
        return await removeSpy(options);
      }
    };

    container.registry.register(adapter);

    const program = createBaseProgram();
    registerRemoveCommand(program, container);

    await program.parseAsync([
      "node",
      "cli",
      "remove",
      "test-service"
    ]);

    expect(removeSpy).toHaveBeenCalledTimes(1);
    expect(
      logs.some((line) =>
        line.includes("Removed Test Service configuration.")
      )
    ).toBe(true);
  });

  it("resolves Roo Code config names and passes mutation hooks", async () => {
    const fs = createMemFs();
    const container = createCliContainer({
      fs,
      prompts: vi.fn().mockResolvedValue({}),
      env: { cwd, homeDir },
      logger: () => {}
    });
    const removeSpy = vi.fn().mockResolvedValue(true);

    const rooAdapter: ProviderAdapter = {
      name: "roo-code",
      label: "Roo Code",
      resolvePaths() {
        return {};
      },
      async remove(context, options: { mutationHooks?: unknown; configName?: string }) {
        void context;
        return await removeSpy(context, options);
      }
    };

    container.registry.register(rooAdapter);

    const resolveConfigNameSpy = vi
      .spyOn(container.options, "resolveConfigName")
      .mockResolvedValue("custom-profile");

    const program = createBaseProgram();
    registerRemoveCommand(program, container);

    await program.parseAsync([
      "node",
      "cli",
      "--dry-run",
      "remove",
      "roo-code",
      "--config-name",
      "my-profile"
    ]);

    expect(resolveConfigNameSpy).toHaveBeenCalledWith(
      "my-profile",
      DEFAULT_ROO_CONFIG_NAME
    );

    expect(removeSpy).toHaveBeenCalledTimes(1);
    const [, options] = removeSpy.mock.calls[0]!;
    expect(options?.configName).toBe("custom-profile");
    expect(options?.mutationHooks).toBeTruthy();
  });
});
