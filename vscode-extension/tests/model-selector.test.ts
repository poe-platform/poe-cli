import { describe, it, expect } from "vitest";
import { renderModelSelector } from "../src/webview/model-selector.js";

describe("renderModelSelector", () => {
  it("marks the chosen model as selected", () => {
    const html = renderModelSelector({
      models: ["model-a", "model-b"],
      selected: "model-a",
    });

    expect(html).toContain(
      '<option value="model-a" selected>model-a</option>'
    );
    expect(html).toContain('<option value="model-b">model-b</option>');
    expect(html).toContain(
      '<input type="search" list="model-list" value="model-a"'
    );
  });
});
