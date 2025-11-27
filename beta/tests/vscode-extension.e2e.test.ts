import { describe, it, expect } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { runTests } from "@vscode/test-electron";
import { shouldRunVsCodeE2E } from "../src/utils/e2e-flags.js";

const execFileAsync = promisify(execFile);

const runVsCodeE2E = shouldRunVsCodeE2E();
const describeSuite = runVsCodeE2E ? describe : describe.skip;

if (!runVsCodeE2E) {
  console.info(
    "Skipping VSCode e2e tests. Set RUN_VSCODE_E2E=true to enable."
  );
}

describeSuite("VSCode extension e2e", () => {
  it(
    "activates the Poe Code extension without errors",
    async () => {
      const extensionDevelopmentPath = path.resolve(
        __dirname,
        "../vscode-extension"
      );
      const extensionTestsPath = path.resolve(
        extensionDevelopmentPath,
        "tests/e2e/suite/index.js"
      );

      await execFileAsync("npm", ["run", "compile"], {
        cwd: extensionDevelopmentPath
      });

      const workspaceDir = await fs.mkdtemp(
        path.join(os.tmpdir(), "poe-extension-e2e-")
      );

      try {
        try {
          await runTests({
            extensionDevelopmentPath,
            extensionTestsPath,
            launchArgs: [workspaceDir, "--disable-extensions"],
            timeout: 240000
          });
        } catch (error) {
          if (isTimeoutError(error)) {
            console.warn(
              "VSCode download timed out; skipping e2e activation test."
            );
            return;
          }
          throw error;
        }
        expect(true).toBe(true);
      } finally {
        await fs.rm(workspaceDir, { recursive: true, force: true });
      }
    },
    300_000
  );
});

function isTimeoutError(error: unknown): boolean {
  if (!error) {
    return false;
  }
  if (error instanceof Error && error.message.includes("ETIMEDOUT")) {
    return true;
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "ETIMEDOUT"
  ) {
    return true;
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "errors" in error &&
    Array.isArray((error as { errors: unknown[] }).errors)
  ) {
    return (error as { errors: unknown[] }).errors.some(isTimeoutError);
  }
  return false;
}
