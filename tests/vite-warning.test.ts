import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

describe("vite usage", () => {
  it("avoids deprecated CJS warning when running extension tests", () => {
    const result = spawnSync(
      "npm",
      ["run", "test", "--", "--run"],
      {
        cwd: join(process.cwd(), "vscode-extension"),
        encoding: "utf8"
      }
    );
    expect(result.status).toBe(0);
    const output = `${result.stdout}${result.stderr}`;
    const warningText =
      "The CJS build of Vite's Node API is deprecated. See https://vite.dev/guide/troubleshooting.html#vite-cjs-node-api-deprecated for more details.";
    expect(output.includes(warningText)).toBe(false);
  });
});
