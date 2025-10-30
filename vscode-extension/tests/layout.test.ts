import { describe, it, expect } from "vitest";
import { renderAppShell } from "../src/webview/layout.js";

describe("renderAppShell", () => {
  it("renders top navigation without sidebar", () => {
    const html = renderAppShell({
      logoUrl: "https://cdn/logo.svg",
      models: ["model-a", "model-b"],
      activeModel: "model-b"
    });

    expect(html).toContain('<img src="https://cdn/logo.svg" alt="Poe Code" />');
    expect(html).toContain('<button data-action="open-history">Chat history</button>');
    expect(html).toContain('<button data-action="open-settings">Settings</button>');
    expect(html).toContain('<button data-action="new-message">New message</button>');
    expect(html).not.toContain("<aside");
  });
});
