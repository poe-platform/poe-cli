import { describe, it, expect } from "vitest";
import { renderAppShell } from "../vscode-extension/src/webview/layout.js";

describe("renderAppShell", () => {
  it("renders compact header with right-aligned actions", () => {
    const html = renderAppShell({
      logoUrl: "vscode-resource:/logo.svg",
      models: ["Claude-Sonnet-4.5", "GPT-5.1"],
      activeModel: "Claude-Sonnet-4.5"
    });
    expect(html).toContain('data-action="new-chat"');
    expect(html).toContain('data-action="open-settings"');
    expect(html).toContain('data-action="chat-history"');
    expect(html).not.toContain("model-summary");

    const newChatIndex = html.indexOf('data-action="new-chat"');
    const historyIndex = html.indexOf('data-action="chat-history"');
    const settingsIndex = html.indexOf('data-action="open-settings"');
    expect(newChatIndex).toBeLessThan(historyIndex);
    expect(historyIndex).toBeLessThan(settingsIndex);
  });
});
