import { describe, it, expect, vi } from "vitest";

const MODULE_PATH = "../src/utils/e2e-flags.ts";

async function loadFlagModule() {
  vi.resetModules();
  return await import(MODULE_PATH);
}

describe("shouldRunVsCodeE2E", () => {
  const originalEnv = process.env.RUN_VSCODE_E2E;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.RUN_VSCODE_E2E;
    } else {
      process.env.RUN_VSCODE_E2E = originalEnv;
    }
  });

  it("returns false when the flag is unset", async () => {
    delete process.env.RUN_VSCODE_E2E;
    const { shouldRunVsCodeE2E } = await loadFlagModule();
    expect(shouldRunVsCodeE2E()).toBe(false);
  });

  it("returns true when the flag is set to a truthy value", async () => {
    process.env.RUN_VSCODE_E2E = "true";
    const { shouldRunVsCodeE2E } = await loadFlagModule();
    expect(shouldRunVsCodeE2E()).toBe(true);
  });

  it("treats falsy string values as disabled", async () => {
    process.env.RUN_VSCODE_E2E = "false";
    const { shouldRunVsCodeE2E } = await loadFlagModule();
    expect(shouldRunVsCodeE2E()).toBe(false);
  });
});
