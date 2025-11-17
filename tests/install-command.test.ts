import { describe, it, expect, vi } from "vitest";
import { Volume, createFsFromVolume } from "memfs";
import { Command } from "commander";
import { registerInstallCommand } from "../src/cli/commands/install.js";
import { createCliContainer } from "../src/cli/container.js";
import type { FileSystem } from "../src/utils/file-system.js";
import type { ProviderAdapter } from "../src/cli/service-registry.js";

const cwd = "/repo";
const homeDir = "/home/test";

function createMemFs(): FileSystem {
  const vol = new Volume();
  vol.mkdirSync(homeDir, { recursive: true });
  return createFsFromVolume(vol).promises as unknown as FileSystem;
}

function createBaseProgram(): Command {
  const program = new Command();
  program.exitOverride();
  program
    .name("poe-code")
    .option("-y, --yes")
    .option("--dry-run")
    .option("--verbose");
  return program;
}

describe("install command", () => {
  it("installs a registered provider and runs prerequisites", async () => {
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

    const callOrder: string[] = [];
    const adapter: ProviderAdapter = {
      name: "test-service",
      label: "Test Service",
      resolvePaths() {
        return {};
      },
      registerPrerequisites(manager) {
        manager.registerAfter({
          id: "after-check",
          description: "after check",
          async run() {
            callOrder.push("after");
          }
        });
      },
      async install() {
        callOrder.push("install");
      }
    };

    container.registry.register(adapter);

    const program = createBaseProgram();
    registerInstallCommand(program, container);

    await program.parseAsync([
      "node",
      "cli",
      "install",
      "test-service"
    ]);

    expect(callOrder).toEqual(["install", "after"]);
    expect(logs.some((line) => line.includes("Installed Test Service"))).toBe(
      true
    );
  });
});
