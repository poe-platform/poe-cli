import { describe, it, expect } from "vitest";
import { renderDiffPreview } from "../src/webview/diff-preview.js";

describe("renderDiffPreview", () => {
  it("highlights added and removed lines", () => {
    const html = renderDiffPreview({
      previous: "one\nshared",
      next: "two\nshared",
      language: "ts",
      filename: "sample.ts",
    });

    expect(html).toContain('data-language="ts"');
    expect(html).toContain(
      '<header class="diff-header">sample.ts</header>'
    );
    expect(html).toContain('class="diff-removed">one</code>');
    expect(html).toContain('class="diff-added">two</code>');
    expect(html).toContain('class="diff-context">shared</code>');
  });
});
