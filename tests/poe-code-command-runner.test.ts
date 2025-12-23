import { describe, it, expect, vi } from "vitest";
import { createCliContainer } from "../src/cli/container.js";
import { createHomeFs } from "./test-helpers.js";

const cwd = "/repo";
const homeDir = "/home/test";

describe("poe-code command runner", () => {
  it("dispatches `poe-code wrap` to the isolated agent binary", async () => {
    const fs = createHomeFs(homeDir);
    const baseRunner = vi.fn(async () => ({
      stdout: "OK\n",
      stderr: "",
      exitCode: 0
    }));
    const container = createCliContainer({
      fs,
      prompts: vi.fn().mockResolvedValue({}),
      env: { cwd, homeDir },
      logger: () => {},
      commandRunner: baseRunner
    });

    const baseDir = `${homeDir}/.poe-code/claude-code`;
    await fs.mkdir(baseDir, { recursive: true });
    await fs.writeFile(`${baseDir}/settings.json`, "{}", "utf8");
    await fs.writeFile(`${baseDir}/anthropic_key.sh`, "echo OK\n", "utf8");
    await fs.chmod(`${baseDir}/anthropic_key.sh`, 0o644);

    const result = await container.commandRunner("poe-code", [
      "wrap",
      "claude-code",
      "-p",
      "Say hi"
    ]);

    expect(baseRunner).toHaveBeenCalledWith(
      "claude",
      ["-p", "Say hi"],
      expect.objectContaining({
        env: expect.objectContaining({
          CLAUDE_CONFIG_DIR: baseDir
        })
      })
    );

    const stat = await fs.stat(`${baseDir}/anthropic_key.sh`);
    expect(stat.mode & 0o777).toBe(0o700);

    expect(result).toEqual({ stdout: "OK\n", stderr: "", exitCode: 0 });
  });
});
