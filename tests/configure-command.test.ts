import { describe, it, expect, vi, beforeEach } from "vitest";
import { executeConfigure } from "../src/cli/commands/configure.js";
import { createCliContainer } from "../src/cli/container.js";
import type { FileSystem } from "../src/utils/file-system.js";
import type { CommandRunner } from "../src/utils/hooks.js";
import { createHomeFs, createTestProgram } from "./test-helpers.js";

const cwd = "/repo";
const homeDir = "/home/test";
const credentialsPath = homeDir + "/.poe-code/credentials.json";

describe("configure command", () => {
  let fs: FileSystem;

  beforeEach(() => {
    fs = createHomeFs(homeDir);
  });

  function createContainer(
    versionMap: Record<string, string | null>,
    overrides: { commandRunner?: CommandRunner } = {}
  ) {
    const prompts = vi.fn().mockResolvedValue({});
    const commandRunner: CommandRunner =
      overrides.commandRunner ??
      vi.fn(async (command, args) => {
        if (args[0] === "--version" && versionMap[command]) {
          return {
            stdout: `${command} ${versionMap[command]}`,
            stderr: "",
            exitCode: 0
          };
        }
        if (command === "codex" && args.includes("exec")) {
          return { stdout: "CODEX_OK\n", stderr: "", exitCode: 0 };
        }
        if (command === "opencode" && args.includes("run")) {
          return { stdout: "OPEN_CODE_OK\n", stderr: "", exitCode: 0 };
        }
        if (command === "claude" && args[0] === "-p") {
          return { stdout: "CLAUDE_CODE_OK\n", stderr: "", exitCode: 0 };
        }
        return { stdout: "", stderr: "", exitCode: 0 };
      });
    const container = createCliContainer({
      fs,
      prompts,
      env: { cwd, homeDir },
      logger: () => {},
      commandRunner
    });
    return { container, prompts, commandRunner };
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
    vi.spyOn(container.options, "resolveModel").mockImplementation(
      async ({ defaultValue }) => defaultValue
    );

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
    vi.spyOn(container.options, "resolveModel").mockImplementation(
      async ({ defaultValue }) => defaultValue
    );

    const program = createTestProgram(["node", "cli", "--dry-run"]);
    await executeConfigure(program, container, "opencode", {});

    await expect(fs.readFile(credentialsPath, "utf8")).rejects.toThrow();
  });

  it("runs provider hooks during configure", async () => {
    const commands: Array<{ command: string; args: string[] }> = [];
    const commandRunner: CommandRunner = vi.fn(async (command, args) => {
      commands.push({ command, args });
      if (command === "codex" && args[0] === "--version") {
        return { stdout: "codex 1.0.0", stderr: "", exitCode: 0 };
      }
      if (command === "codex" && args.includes("exec")) {
        return { stdout: "CODEX_OK\n", stderr: "", exitCode: 0 };
      }
      return { stdout: "", stderr: "", exitCode: 0 };
    });

    const { container } = createContainer(
      { codex: "1.0.0" },
      { commandRunner }
    );

    vi.spyOn(container.options, "resolveApiKey").mockResolvedValue("sk-test");
    vi.spyOn(container.options, "resolveModel").mockResolvedValue(
      "codex-model"
    );
    vi.spyOn(container.options, "resolveReasoning").mockResolvedValue("none");

    const program = createTestProgram();
    await executeConfigure(program, container, "codex", {});

    const healthCheckCall = commands.find(
      ({ command, args }) => command === "codex" && args.includes("exec")
    );
    expect(healthCheckCall).toBeDefined();
  });

  it("uses provider-defined prompt metadata for configure flows", async () => {
    const { container } = createContainer({ codex: null });
    const provider = container.registry.require("codex") as any;
    provider.configurePrompts = {
      model: {
        label: "Custom Codex model",
        defaultValue: "custom-model",
        choices: [{ title: "Custom", value: "custom-model" }]
      },
      reasoningEffort: {
        label: "Custom reasoning label",
        defaultValue: "extra"
      }
    };

    const resolveModel = vi
      .spyOn(container.options, "resolveModel")
      .mockImplementation(async (input) => {
        expect(input.label).toBe("Custom Codex model");
        expect(input.defaultValue).toBe("custom-model");
        return input.defaultValue;
      });
    const resolveReasoning = vi
      .spyOn(container.options, "resolveReasoning")
      .mockImplementation(async (input) => {
        expect(input.label).toBe("Custom reasoning label");
        expect(input.defaultValue).toBe("extra");
        return input.defaultValue;
      });
    vi.spyOn(container.options, "resolveApiKey").mockResolvedValue("sk-test");

    const program = createTestProgram();
    await executeConfigure(program, container, "codex", {});

    expect(resolveModel).toHaveBeenCalled();
    expect(resolveReasoning).toHaveBeenCalled();
  });
});
