import { describe, it, expect } from "vitest";
import { renderAppShell } from "../src/webview/layout.js";

describe("renderAppShell", () => {
  it("renders models and highlights the active one", () => {
    const html = renderAppShell({
      logoUrl: "https://cdn/logo.svg",
      models: ["model-a", "model-b"],
      activeModel: "model-b",
    });

    expect(html).toContain('<img src="https://cdn/logo.svg" alt="Poe Code" />');
    expect(html).toContain('<li class="model-item">model-a</li>');
    expect(html).toContain('<li class="model-item active">model-b</li>');
  });
});
