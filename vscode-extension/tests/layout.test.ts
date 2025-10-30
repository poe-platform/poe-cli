import { describe, it, expect } from "vitest";
import { renderAppShell } from "../src/webview/layout.js";

describe("renderAppShell", () => {
  it("renders brand and action buttons without model summary", () => {
    const html = renderAppShell({
      logoUrl: "https://cdn/logo.svg",
      models: ["model-a", "model-b"],
      activeModel: "model-b",
    });

    expect(html).toContain('<img src="https://cdn/logo.svg" alt="Poe Code" />');
    expect(html).not.toContain("model-summary");
    expect(html).toContain('<button data-action="chat-history">Chat History</button>');
    expect(html).toContain('<button data-action="open-settings">Settings</button>');
    expect(html).toContain('<button data-action="new-chat" class="primary">New Message</button>');
  });
});
