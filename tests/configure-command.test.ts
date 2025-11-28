import { describe, it, expect, vi, beforeEach } from "vitest";
import { executeConfigure } from "../src/cli/commands/configure.js";
import { createCliContainer } from "../src/cli/container.js";
import type { FileSystem } from "../src/utils/file-system.js";
import type { CommandRunner } from "../src/utils/prerequisites.js";
import { createHomeFs, createTestProgram } from "./test-helpers.js";

const cwd = "/repo";
const homeDir = "/home/test";
const credentialsPath = homeDir + "/.poe-code/credentials.json";

describe("configure command", () => {
  let fs: FileSystem;

  beforeEach(() => {
    fs = createHomeFs(homeDir);
  });

  function createContainer(versionMap: Record<string, string | null>) {
    const prompts = vi.fn().mockResolvedValue({});
    const commandRunner: CommandRunner = vi.fn(async (command, args) => {
      if (args[0] === "--version" && versionMap[command]) {
        return { stdout: `${command} ${versionMap[command]}`, stderr: "", exitCode: 0 };
      }
      return { stdout: "", stderr: "", exitCode: 1 };
    });
    const container = createCliContainer({
      fs,
      prompts,
      env: { cwd, homeDir },
      logger: () => {},
      commandRunner
    });
    return { container, prompts };
  }

  it("does not invoke install when configuring a service", async () => {
    const { container } = createContainer({ codex: null });

    vi.spyOn(container.options, "resolveApiKey").mockResolvedValue("sk-test");
    vi.spyOn(container.options, "resolveModel").mockResolvedValue(
      "test-model"
    );
    vi.spyOn(container.options, "resolveReasoning").mockResolvedValue("none");

    const invokeSpy = vi.spyOn(container.registry, "invoke");
    const program = createTestProgram();

    await executeConfigure(program, container, "codex", {});

    expect(invokeSpy).toHaveBeenCalledTimes(1);
    const [, operation] = invokeSpy.mock.calls[0]!;
    expect(operation).toBe("configure");
  });

  it("stores configured service metadata with detected version", async () => {
    const { container } = createContainer({ opencode: "2.3.4" });
    vi.spyOn(container.options, "resolveApiKey").mockResolvedValue("sk-opencode");

    const program = createTestProgram();
    await executeConfigure(program, container, "opencode", {});

    const content = JSON.parse(await fs.readFile(credentialsPath, "utf8"));
    expect(content.configured_services.opencode).toEqual({
      version: "2.3.4",
      files: [
        homeDir + "/.config/opencode/config.json",
        homeDir + "/.local/share/opencode/auth.json"
      ]
    });
  });

  it("skips metadata persistence during dry run", async () => {
    const { container } = createContainer({ opencode: "2.3.4" });
    vi.spyOn(container.options, "resolveApiKey").mockResolvedValue("sk-opencode");

    const program = createTestProgram(["node", "cli", "--dry-run"]);
    await executeConfigure(program, container, "opencode", {});

    await expect(fs.readFile(credentialsPath, "utf8")).rejects.toThrow();
  });
});
