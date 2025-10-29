import { describe, it, expect } from "vitest";
import { renderMarkdown } from "../src/webview/markdown.js";

describe("renderMarkdown", () => {
  it("renders inline formatting safely", () => {
    const html = renderMarkdown("Hello **bold** _italic_ `code` & more");
    expect(html).toContain("<p>Hello <strong>bold</strong> <em>italic</em>");
    expect(html).toContain("<code>code</code>");
    expect(html).toContain("&amp; more</p>");
  });

  it("renders fenced code blocks with language labels", () => {
    const html = renderMarkdown("```ts\nconst x = 1;\n```");
    expect(html).toContain(
      '<pre><code class="language-ts">const x = 1;</code></pre>'
    );
  });
});
