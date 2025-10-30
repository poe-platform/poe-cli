import { describe, it, expect } from "vitest";
import { renderAppShell } from "../vscode-extension/src/webview/layout.js";

describe("renderAppShell", () => {
  it("renders compact header with right-aligned actions", () => {
    const html = renderAppShell({
      logoUrl: "vscode-resource:/logo.svg",
      models: ["Claude-Sonnet-4.5", "GPT-5"],
      activeModel: "Claude-Sonnet-4.5"
    });
    expect(html).toContain('<button data-action="new-chat"');
    expect(html).toContain('<button data-action="open-settings"');
    expect(html).toContain('<button data-action="chat-history"');
    expect(html).not.toContain("model-summary");

    const historyIndex = html.indexOf('data-action="chat-history"');
    const settingsIndex = html.indexOf('data-action="open-settings"');
    const newChatIndex = html.indexOf('data-action="new-chat"');
    expect(historyIndex).toBeLessThan(settingsIndex);
    expect(settingsIndex).toBeLessThan(newChatIndex);
  });
});
