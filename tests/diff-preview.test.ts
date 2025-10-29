import { describe, it, expect } from "vitest";
import { renderDiffPreview } from "../vscode-extension/src/webview/diff-preview.js";

describe("renderDiffPreview", () => {
  it("renders side-by-side diff for file changes", () => {
    const html = renderDiffPreview({
      previous: "const value = 1;\n",
      next: "const value = 2;\n",
      language: "ts",
      filename: "example.ts"
    });

    expect(html).toContain("example.ts");
    expect(html).toContain("diff-added");
    expect(html).toContain("diff-removed");
  });
});

