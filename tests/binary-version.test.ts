import { describe, it, expect } from "vitest";
import { detectBinaryVersion } from "../src/utils/binary-version.js";
import type { CommandRunner } from "../src/utils/hooks.js";

describe("binary version detection", () => {
  it("extracts the first semver from stdout", async () => {
    const runCommand: CommandRunner = async () => ({
      stdout: "cli version 1.2.3\n",
      stderr: "",
      exitCode: 0
    });

    const result = await detectBinaryVersion(runCommand, "demo");
    expect(result.version).toBe("1.2.3");
    expect(result.rawOutput).toBe("cli version 1.2.3");
  });

  it("throws when version output cannot be parsed", async () => {
    const runCommand: CommandRunner = async () => ({
      stdout: "cli build (commit abcdef)\n",
      stderr: "",
      exitCode: 0
    });

    await expect(detectBinaryVersion(runCommand, "demo")).rejects.toThrow(
      /Unable to parse version/i
    );
  });

  it("includes stderr details when detection fails", async () => {
    const runCommand: CommandRunner = async () => ({
      stdout: "",
      stderr: "spawn claude ENOENT",
      exitCode: -2
    });

    await expect(detectBinaryVersion(runCommand, "claude")).rejects.toThrow(
      /spawn claude ENOENT/
    );
  });
});
