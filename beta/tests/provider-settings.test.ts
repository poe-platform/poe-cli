import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadProviderSettings } from "../vscode-extension/src/config/provider-settings.js";

let tempDir: string;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "poe-settings-"));
});

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("loadProviderSettings", () => {
  it("reads provider list from parent dist manifest", async () => {
    const manifestDir = path.join(tempDir, "dist", "services");
    fs.mkdirSync(manifestDir, { recursive: true });
    const manifestPath = path.join(manifestDir, "manifest.json");
    fs.writeFileSync(
      manifestPath,
      JSON.stringify({
        services: [
          { id: "claude-code", label: "Claude Code" },
          { id: "roo-code", label: "Roo Code" }
        ]
      }),
      "utf8"
    );

    const settings = await loadProviderSettings(tempDir);
    expect(settings).toEqual([
      { id: "claude-code", label: "Claude Code" },
      { id: "roo-code", label: "Roo Code" }
    ]);
  });
});

