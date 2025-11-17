import { describe, it, expect, vi, beforeEach } from "vitest";
import { Volume, createFsFromVolume } from "memfs";
import { Command } from "commander";
import { executeConfigure } from "../src/cli/commands/configure.js";
import { createCliContainer } from "../src/cli/container.js";
import type { FileSystem } from "../src/utils/file-system.js";

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
  program.parse(["node", "cli"]);
  return program;
}

describe("configure command", () => {
  let fs: FileSystem;

  beforeEach(() => {
    fs = createMemFs();
  });

  it("does not invoke install when configuring a service", async () => {
    const prompts = vi.fn().mockResolvedValue({});
    const container = createCliContainer({
      fs,
      prompts,
      env: { cwd, homeDir },
      logger: () => {}
    });

    vi.spyOn(container.options, "resolveApiKey").mockResolvedValue("sk-test");
    vi.spyOn(container.options, "resolveModel").mockResolvedValue(
      "test-model"
    );
    vi.spyOn(container.options, "resolveReasoning").mockResolvedValue("none");

    const invokeSpy = vi.spyOn(container.registry, "invoke");
    const program = createBaseProgram();

    await executeConfigure(program, container, "codex", {});

    expect(invokeSpy).toHaveBeenCalledTimes(1);
    const [, operation] = invokeSpy.mock.calls[0]!;
    expect(operation).toBe("configure");
  });
});
