import { describe, it, expect } from "vitest";
import { renderModelSelector } from "../vscode-extension/src/webview/model-selector.js";

describe("renderModelSelector", () => {
  it("renders searchable select with custom value support", () => {
    const html = renderModelSelector({
      models: ["Claude-Sonnet-4.5", "GPT-5.1"],
      selected: "Claude-Sonnet-4.5"
    });

    expect(html).toContain('type="search"');
    expect(html).toContain('data-allow-custom="true"');
    expect(html).toContain("Claude-Sonnet-4.5");
  });
});

