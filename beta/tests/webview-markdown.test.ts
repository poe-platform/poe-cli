import { describe, it, expect } from "vitest";
import { renderMarkdown } from "../vscode-extension/src/webview/markdown.js";

describe("renderMarkdown", () => {
  it("renders basic markdown emphasis", () => {
    const html = renderMarkdown("**Hello** _world_");
    expect(html).toContain("<strong>Hello</strong>");
    expect(html).toContain("<em>world</em>");
  });

  it("renders fenced code blocks with language classes", () => {
    const html = renderMarkdown("```ts\nconst value = 1;\n```");
    expect(html).toContain('<pre><code class="language-ts">');
    expect(html).toContain("const value = 1;");
  });

  it("renders inline code blocks", () => {
    const html = renderMarkdown("Use `poe-code` to configure.");
    expect(html).toContain("<code>poe-code</code>");
  });
});
