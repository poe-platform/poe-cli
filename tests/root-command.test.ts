import { describe, it, expect, vi, afterEach } from "vitest";
import { Volume, createFsFromVolume } from "memfs";
import { createProgram } from "../src/cli/program.js";
import type { FileSystem } from "../src/utils/file-system.js";
import * as configureModule from "../src/cli/commands/configure.js";

function createMemFs(): FileSystem {
  const vol = new Volume();
  vol.mkdirSync("/home/test", { recursive: true });
  return createFsFromVolume(vol).promises as unknown as FileSystem;
}

describe("root command", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("prompts for a service when invoked without arguments", async () => {
    const fs = createMemFs();
    const prompts = vi.fn().mockResolvedValue({});

    const resolveSpy = vi
      .spyOn(configureModule, "resolveServiceArgument")
      .mockResolvedValue("claude-code");
    const executeSpy = vi
      .spyOn(configureModule, "executeConfigure")
      .mockResolvedValue();

    const program = createProgram({
      fs,
      prompts,
      env: {
        cwd: "/repo",
        homeDir: "/home/test"
      },
      logger: () => {}
    });

    await program.parseAsync(["node", "cli"]);

    expect(resolveSpy).toHaveBeenCalledTimes(1);
    const [calledProgram] = resolveSpy.mock.calls[0]!;
    expect(calledProgram).toBe(program);

    expect(executeSpy).toHaveBeenCalledWith(
      program,
      expect.anything(),
      "claude-code",
      {}
    );
  });

  it("registers a --verbose flag", () => {
    const fs = createMemFs();
    const prompts = vi.fn().mockResolvedValue({});
    const program = createProgram({
      fs,
      prompts,
      env: {
        cwd: "/repo",
        homeDir: "/home/test"
      },
      logger: () => {}
    });

    const hasVerbose = program.options.some(
      (option) => option.long === "--verbose"
    );
    expect(hasVerbose).toBe(true);
  });
});
