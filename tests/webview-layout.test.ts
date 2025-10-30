import { describe, it, expect } from "vitest";
import { renderAppShell } from "../vscode-extension/src/webview/layout.js";

describe("renderAppShell", () => {
  it("renders top navigation with menu items", () => {
    const html = renderAppShell({
      logoUrl: "vscode-resource:/logo.svg",
      models: ["Claude-Sonnet-4.5", "GPT-5"],
      activeModel: "Claude-Sonnet-4.5"
    });

    expect(html).toContain('<button data-action="open-history">Chat history</button>');
    expect(html).toContain('<button data-action="open-settings">Settings</button>');
    expect(html).toContain('<button data-action="new-message">New message</button>');
  });
});
