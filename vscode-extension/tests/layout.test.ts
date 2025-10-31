import { describe, it, expect } from "vitest";
import { renderAppShell } from "../src/webview/layout.js";

describe("renderAppShell", () => {
  it("renders brand and action buttons without model summary", () => {
    const html = renderAppShell({
      logoUrl: "https://cdn/logo.svg",
      models: ["model-a", "model-b"],
      activeModel: "model-b",
    });

    expect(html).toContain('data-action="chat-history"');
    expect(html).toContain('data-action="open-settings"');
    expect(html).toContain('data-action="new-chat"');
    expect(html).not.toContain('data-action="strategy-open"');
  });
});
