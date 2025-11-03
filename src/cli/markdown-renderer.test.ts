import { describe, it, expect } from "vitest";
import { renderMarkdown, stripAnsi, markdownToPlaintext } from "./markdown-renderer.js";

describe("markdown-renderer", () => {
  describe("renderMarkdown", () => {
    it("should render headers with formatting", () => {
      const input = "# Header 1\n## Header 2\n### Header 3";
      const output = renderMarkdown(input);
      expect(stripAnsi(output)).toContain("Header 1");
      expect(stripAnsi(output)).toContain("Header 2");
      expect(stripAnsi(output)).toContain("Header 3");
    });

    it("should render bold text", () => {
      const input = "This is **bold** text";
      const output = renderMarkdown(input);
      expect(stripAnsi(output)).toBe("This is bold text");
      expect(output).toContain("\x1b[1m"); // BOLD code
    });

    it("should render italic text", () => {
      const input = "This is *italic* text";
      const output = renderMarkdown(input);
      expect(stripAnsi(output)).toBe("This is italic text");
      expect(output).toContain("\x1b[3m"); // ITALIC code
    });

    it("should render inline code", () => {
      const input = "Use `console.log()` for debugging";
      const output = renderMarkdown(input);
      expect(stripAnsi(output)).toBe("Use console.log() for debugging");
      expect(output).toContain("\x1b[33m"); // YELLOW code
    });

    it("should render code blocks", () => {
      const input = "```javascript\nconst x = 1;\n```";
      const output = renderMarkdown(input);
      expect(stripAnsi(output)).toContain("const x = 1;");
    });

    it("should render lists", () => {
      const input = "- Item 1\n- Item 2\n- Item 3";
      const output = renderMarkdown(input);
      expect(stripAnsi(output)).toContain("Item 1");
      expect(stripAnsi(output)).toContain("Item 2");
      expect(stripAnsi(output)).toContain("Item 3");
    });

    it("should render numbered lists", () => {
      const input = "1. First\n2. Second\n3. Third";
      const output = renderMarkdown(input);
      expect(stripAnsi(output)).toContain("First");
      expect(stripAnsi(output)).toContain("Second");
      expect(stripAnsi(output)).toContain("Third");
    });

    it("should render blockquotes", () => {
      const input = "> This is a quote";
      const output = renderMarkdown(input);
      expect(stripAnsi(output)).toContain("This is a quote");
    });

    it("should render links", () => {
      const input = "[Google](https://google.com)";
      const output = renderMarkdown(input);
      expect(stripAnsi(output)).toContain("Google");
      expect(stripAnsi(output)).toContain("https://google.com");
    });

    it("should handle mixed formatting", () => {
      const input = "This is **bold** and *italic* and `code`";
      const output = renderMarkdown(input);
      expect(stripAnsi(output)).toBe("This is bold and italic and code");
    });

    it("should preserve empty lines", () => {
      const input = "Line 1\n\nLine 2";
      const output = renderMarkdown(input);
      expect(output.split("\n")).toHaveLength(3);
    });
  });

  describe("stripAnsi", () => {
    it("should remove all ANSI codes", () => {
      const input = "\x1b[1mBold\x1b[0m \x1b[3mItalic\x1b[0m";
      const output = stripAnsi(input);
      expect(output).toBe("Bold Italic");
    });

    it("should handle text without ANSI codes", () => {
      const input = "Plain text";
      const output = stripAnsi(input);
      expect(output).toBe("Plain text");
    });
  });

  describe("markdownToPlaintext", () => {
    it("should convert markdown to plain text", () => {
      const input = "# Header\n\nThis is **bold** and *italic*";
      const output = markdownToPlaintext(input);
      expect(output).not.toContain("**");
      expect(output).not.toContain("*");
      expect(output).not.toContain("#");
    });

    it("should convert links to text with URL", () => {
      const input = "[Google](https://google.com)";
      const output = markdownToPlaintext(input);
      expect(output).toContain("Google");
      expect(output).toContain("https://google.com");
    });

    it("should handle code blocks", () => {
      const input = "```\ncode\n```";
      const output = markdownToPlaintext(input);
      expect(output).toContain("code");
      expect(output).not.toContain("```");
    });
  });
});
