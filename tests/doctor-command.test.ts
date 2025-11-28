import { describe, it, expect, beforeEach, vi } from "vitest";
import { executeDoctor } from "../src/cli/commands/doctor.js";
import { executeConfigure } from "../src/cli/commands/configure.js";
import { createCliContainer } from "../src/cli/container.js";
import type { FileSystem } from "../src/utils/file-system.js";
import type { CommandRunner } from "../src/utils/prerequisites.js";
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
    return container;
  }

  it("refreshes services when versions differ", async () => {
    const container = createContainer({ opencode: "3.1.0" });
    const program = createTestProgram();

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
    await executeConfigure(program, container, "opencode", {});

    const invokeSpy = vi.spyOn(container.registry, "invoke");
    await executeDoctor(program, container);

    expect(invokeSpy).not.toHaveBeenCalled();
  });
});
