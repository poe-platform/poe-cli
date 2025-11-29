import { describe, it, expect, vi } from "vitest";
import {
  createBinaryExistsCheck,
  createCommandExpectationHook
} from "../src/utils/hooks.js";

function createRunner(responses: Record<string, { stdout?: string; stderr?: string; exitCode: number }>) {
  return vi.fn(async (command: string, args: string[]) => {
    const key = [command, ...args].join(" ");
    const response = responses[key];
    if (!response) {
      throw new Error(`Unexpected command: ${key}`);
    }
    return {
      stdout: response.stdout ?? "",
      stderr: response.stderr ?? "",
      exitCode: response.exitCode
    };
  });
}

describe("createBinaryExistsCheck", () => {
  it("runs the version command after locating the binary", async () => {
    const runCommand = createRunner({
      "which demo": { stdout: "/usr/bin/demo\n", exitCode: 0 },
      "demo --version": { stdout: "demo 2.0.0\n", exitCode: 0 }
    });

    const check = createBinaryExistsCheck("demo", "demo-id", "demo desc");
    await check.run({ isDryRun: false, runCommand });

    expect(runCommand).toHaveBeenCalledWith("which", ["demo"]);
    expect(runCommand).toHaveBeenCalledWith("demo", ["--version"]);
  });

  it("fails when the version output lacks a semver", async () => {
    const runCommand = createRunner({
      "which demo": { stdout: "/usr/bin/demo\n", exitCode: 0 },
      "demo --version": { stdout: "demo build unknown\n", exitCode: 0 }
    });

    const check = createBinaryExistsCheck("demo", "demo-id", "demo desc");
    await expect(
      check.run({ isDryRun: false, runCommand })
    ).rejects.toThrow(/Unable to parse version/i);
  });
});

describe("createCommandExpectationHook", () => {
  it("derives a description based on the command and expected output", () => {
    const check = createCommandExpectationHook({
      id: "demo-health",
      command: "demo",
      args: ["run", 'Output exactly: "DEMO_OK"'],
      expectedOutput: "DEMO_OK"
    });

    expect(check.description).toBe(
      'demo run "Output exactly: \\"DEMO_OK\\"" (expecting "DEMO_OK")'
    );
  });
});
