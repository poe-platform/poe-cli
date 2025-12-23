import { describe, it, expect, beforeEach, vi } from "vitest";
import { executeDoctor } from "../src/cli/commands/doctor.js";
import { executeConfigure } from "../src/cli/commands/configure.js";
import { createCliContainer } from "../src/cli/container.js";
import type { FileSystem } from "../src/utils/file-system.js";
import type { CommandRunner } from "../src/utils/command-checks.js";
import {
  saveConfiguredService,
  loadConfiguredServices
} from "../src/services/credentials.js";
import { createHomeFs, createTestProgram } from "./test-helpers.js";

const cwd = "/repo";
const homeDir = "/home/test";
const credentialsPath = homeDir + "/.poe-code/credentials.json";

describe("doctor command", () => {
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
      if (command === "opencode" && args.includes("run")) {
        return { stdout: "OPEN_CODE_OK\n", stderr: "", exitCode: 0 };
      }
      if (command === "codex" && args[0] === "exec") {
        return { stdout: "CODEX_OK\n", stderr: "", exitCode: 0 };
      }
      if (command === "claude" && args[0] === "-p") {
        return { stdout: "CLAUDE_CODE_OK\n", stderr: "", exitCode: 0 };
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
    vi.spyOn(container.options, "resolveApiKey").mockResolvedValue("sk-test");
    vi.spyOn(container.options, "resolveModel").mockImplementation(
      async ({ defaultValue }) => defaultValue
    );
    return container;
  }

  it("refreshes services when versions differ", async () => {
    const container = createContainer({ opencode: "3.1.0" });
    const program = createTestProgram();

    await fs.mkdir(`${homeDir}/.poe-code/opencode/.config/opencode`, {
      recursive: true
    });
    await fs.writeFile(
      `${homeDir}/.poe-code/opencode/.config/opencode/config.json`,
      "{}",
      { encoding: "utf8" }
    );

    await executeConfigure(program, container, "opencode", {});

    const initial = await loadConfiguredServices({ fs, filePath: credentialsPath });
    const files = initial.opencode?.files ?? [];
    await saveConfiguredService({
      fs,
      filePath: credentialsPath,
      service: "opencode",
      metadata: { version: "2.0.0", files }
    });

    await executeDoctor(program, container);

    const updated = await loadConfiguredServices({ fs, filePath: credentialsPath });
    expect(updated.opencode?.version).toBe("3.1.0");
  });

  it("skips services when versions match", async () => {
    const container = createContainer({ opencode: "3.1.0" });
    const program = createTestProgram();

    await fs.mkdir(`${homeDir}/.poe-code/opencode/.config/opencode`, {
      recursive: true
    });
    await fs.writeFile(
      `${homeDir}/.poe-code/opencode/.config/opencode/config.json`,
      "{}",
      { encoding: "utf8" }
    );
    await executeConfigure(program, container, "opencode", {});

    const invokeSpy = vi.spyOn(container.registry, "invoke");
    await executeDoctor(program, container);

    expect(invokeSpy).not.toHaveBeenCalledWith(
      "opencode",
      expect.anything(),
      expect.anything()
    );
  });

  it("does not configure unrelated isolated services", async () => {
    const container = createContainer({ opencode: "3.1.0" });
    const program = createTestProgram();

    await fs.mkdir(`${homeDir}/.poe-code/opencode/.config/opencode`, {
      recursive: true
    });
    await fs.writeFile(
      `${homeDir}/.poe-code/opencode/.config/opencode/config.json`,
      "{}",
      { encoding: "utf8" }
    );

    await saveConfiguredService({
      fs,
      filePath: credentialsPath,
      service: "opencode",
      metadata: { version: "3.1.0", files: [] }
    });

    const invokeSpy = vi.spyOn(container.registry, "invoke");
    await executeDoctor(program, container);

    expect(invokeSpy).not.toHaveBeenCalled();
  });
});
