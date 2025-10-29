import { describe, it, expect } from "vitest";
import { renderAppShell } from "../vscode-extension/src/webview/layout.js";

describe("renderAppShell", () => {
  it("renders navigation menu with settings and models", () => {
    const html = renderAppShell({
      logoUrl: "vscode-resource:/logo.svg",
      models: ["Claude-Sonnet-4.5", "GPT-5"],
      activeModel: "Claude-Sonnet-4.5"
    });

    expect(html).toContain("<nav");
    expect(html).toContain("Settings");
    expect(html).toContain("Models");
    expect(html).toContain("Claude-Sonnet-4.5");
  });
});

