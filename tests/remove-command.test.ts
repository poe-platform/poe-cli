import { describe, it, expect, vi, afterEach } from "vitest";
import { Command } from "commander";
import { Volume, createFsFromVolume } from "memfs";
import { createCliContainer } from "../src/cli/container.js";
import type { FileSystem } from "../src/utils/file-system.js";
import type { ProviderService } from "../src/cli/service-registry.js";
import { registerRemoveCommand } from "../src/cli/commands/remove.js";
import { createProviderStub } from "./provider-stub.js";
import type {
  MutationLogDetails,
  ServiceMutationOutcome
} from "../src/services/service-manifest.js";

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

    const removeSpy = vi.fn();

    const adapter: ProviderService = createProviderStub({
      name: "test-service",
      label: "Test Service",
      resolvePaths() {
        return {};
      },
      async remove(context) {
        removeSpy(context.options);
        return true;
      }
    });

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

  it("logs mutation outcomes when provider reports them", async () => {
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

    const details: MutationLogDetails = {
      manifestId: "test-service",
      kind: "transformFile",
      label: "Transform file /home/test/.config/opencode/config.json",
      targetPath: "/home/test/.config/opencode/config.json"
    };
    const outcome: ServiceMutationOutcome = {
      changed: true,
      effect: "delete",
      detail: "delete"
    };

    const adapter: ProviderService = createProviderStub({
      name: "test-service",
      label: "Test Service",
      async remove(_context, runOptions) {
        runOptions?.hooks?.onComplete?.(details, outcome);
        return true;
      }
    });

    container.registry.register(adapter);

    const program = createBaseProgram();
    registerRemoveCommand(program, container);

    await program.parseAsync([
      "node",
      "cli",
      "remove",
      "test-service"
    ]);

    expect(
      logs.some((line) =>
        line.includes(
          "Transform file /home/test/.config/opencode/config.json: delete"
        )
      )
    ).toBe(true);
  });

});
