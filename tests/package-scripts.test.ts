import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("package scripts", () => {
  it("runs both root and VSCode extension tests", () => {
    const path = join(process.cwd(), "package.json");
    const raw = readFileSync(path, "utf8");
    const pkg = JSON.parse(raw) as { scripts?: Record<string, string> };
    const testScript = pkg.scripts?.test ?? "";
    expect(testScript.includes("npm run test --prefix vscode-extension")).toBe(
      true
    );
  });
});
