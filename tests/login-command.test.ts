import { describe, it, expect, beforeEach, vi } from "vitest";
import { Volume, createFsFromVolume } from "memfs";
import { createProgram } from "../src/cli/program.js";
import type { FileSystem } from "../src/utils/file-system.js";

function createMemfs(homeDir: string): FileSystem {
  const volume = new Volume();
  volume.mkdirSync(homeDir, { recursive: true });
  return createFsFromVolume(volume).promises as unknown as FileSystem;
}

describe("login command", () => {
  const cwd = "/repo";
  const homeDir = "/home/test";
  const credentialsPath = `${homeDir}/.poe-code/credentials.json`;
  let fs: FileSystem;
  let logs: string[];
  let prompts: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fs = createMemfs(homeDir);
    logs = [];
    prompts = vi.fn();
  });

  it("stores the provided api key flag", async () => {
    const program = createProgram({
      fs,
      prompts,
      env: { cwd, homeDir },
      logger: (message) => {
        logs.push(message);
      }
    });

    await program.parseAsync([
      "node",
      "cli",
      "login",
      "--api-key",
      "test-key"
    ]);

    const raw = await fs.readFile(credentialsPath, "utf8");
    expect(JSON.parse(raw)).toEqual({ apiKey: "test-key" });
    expect(prompts).not.toHaveBeenCalled();
    expect(
      logs.some((message) =>
        message.includes(`Poe API key stored at ${credentialsPath}.`)
      )
    ).toBe(true);
  });

  it("prompts for an api key when flag missing", async () => {
    prompts.mockResolvedValue({ apiKey: "prompt-key" });
    const program = createProgram({
      fs,
      prompts,
      env: { cwd, homeDir },
      logger: (message) => {
        logs.push(message);
      }
    });

    await program.parseAsync(["node", "cli", "login"]);

    const stored = await fs.readFile(credentialsPath, "utf8");
    expect(JSON.parse(stored)).toEqual({ apiKey: "prompt-key" });
    expect(prompts).toHaveBeenCalledTimes(1);
    const [descriptor] = prompts.mock.calls[0]!;
    expect(descriptor.message).toContain("Poe API key");
  });

  it("skips writing credentials during dry run", async () => {
    const program = createProgram({
      fs,
      prompts,
      env: { cwd, homeDir },
      logger: (message) => {
        logs.push(message);
      }
    });

    await program.parseAsync([
      "node",
      "cli",
      "--dry-run",
      "login",
      "--api-key",
      "dry-key"
    ]);

    await expect(fs.readFile(credentialsPath, "utf8")).rejects.toThrow();
    expect(
      logs.some((message) =>
        message.includes(`Dry run: would store Poe API key at ${credentialsPath}.`)
      )
    ).toBe(true);
  });
});
