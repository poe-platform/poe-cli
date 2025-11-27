/**
 * Simple terminal markdown renderer with ANSI escape codes
 * Falls back to plaintext for unsupported features
 */

// ANSI escape codes
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const ITALIC = "\x1b[3m";
const UNDERLINE = "\x1b[4m";

// Colors
const YELLOW = "\x1b[33m";
const BLUE = "\x1b[34m";
const MAGENTA = "\x1b[35m";
const CYAN = "\x1b[36m";
const GRAY = "\x1b[90m";

// Background colors
const BG_BLACK = "\x1b[40m";
const BG_GRAY = "\x1b[100m";

interface RenderOptions {
  /**
   * Maximum width for wrapping text (0 = no wrapping)
   */
  maxWidth?: number;
  /**
   * Indent for nested content (lists, quotes, code blocks)
   */
  indent?: string;
}

/**
 * Renders markdown text to terminal with ANSI formatting
 */
export function renderMarkdown(markdown: string, options: RenderOptions = {}): string {
  const { indent = "" } = options;
  const lines = markdown.split("\n");
  const output: string[] = [];
  let inCodeBlock = false;
  let inList = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Code blocks
    if (trimmed.startsWith("```")) {
      if (!inCodeBlock) {
        inCodeBlock = true;
        output.push(""); // Empty line before code block
        continue;
      } else {
        // End code block
        inCodeBlock = false;
        output.push(""); // Empty line after code block
        continue;
      }
    }

    if (inCodeBlock) {
      // Render code block line
      output.push(indent + "  " + GRAY + BG_GRAY + line + RESET);
      continue;
    }

    // Headers (# ## ###)
    const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headerMatch) {
      const level = headerMatch[1].length;
      const text = headerMatch[2];
      const color = level === 1 ? CYAN : level === 2 ? BLUE : MAGENTA;
      output.push("");
      output.push(indent + color + BOLD + text + RESET);
      output.push("");
      continue;
    }

    // Horizontal rule (---, ___, ***)
    if (/^(\*{3,}|-{3,}|_{3,})$/.test(trimmed)) {
      output.push(indent + GRAY + "─".repeat(40) + RESET);
      continue;
    }

    // Lists (- item, * item, 1. item)
    const listMatch = line.match(/^(\s*)([-*+]|\d+\.)\s+(.+)$/);
    if (listMatch) {
      const listIndentStr = listMatch[1];
      const bullet = listMatch[2];
      const content = listMatch[3];
      const level = Math.floor(listIndentStr.length / 2);
      const renderedBullet = bullet.match(/\d+\./) ? bullet : "•";
      output.push(
        indent + "  ".repeat(level) + YELLOW + renderedBullet + RESET + " " + renderInline(content)
      );
      inList = true;
      continue;
    } else if (inList && trimmed === "") {
      inList = false;
    }

    // Blockquotes (> text)
    if (trimmed.startsWith(">")) {
      const quoteText = trimmed.slice(1).trim();
      output.push(indent + GRAY + "│ " + RESET + DIM + renderInline(quoteText) + RESET);
      continue;
    }

    // Empty lines
    if (trimmed === "") {
      output.push("");
      continue;
    }

    // Regular paragraph text
    output.push(indent + renderInline(line));
  }

  return output.join("\n");
}

/**
 * Renders inline markdown formatting (bold, italic, code, links)
 */
function renderInline(text: string): string {
  let result = text;

  // Inline code (`code`)
  result = result.replace(/`([^`]+)`/g, (_match, code) => {
    return YELLOW + BG_BLACK + code + RESET;
  });

  // Bold (**text** or __text__)
  result = result.replace(/\*\*([^*]+)\*\*/g, (_match, text) => {
    return BOLD + text + RESET;
  });
  result = result.replace(/__([^_]+)__/g, (_match, text) => {
    return BOLD + text + RESET;
  });

  // Italic (*text* or _text_) - must come after bold
  result = result.replace(/\*([^*]+)\*/g, (_match, text) => {
    return ITALIC + text + RESET;
  });
  result = result.replace(/_([^_]+)_/g, (_match, text) => {
    return ITALIC + text + RESET;
  });

  // Strikethrough (~~text~~)
  result = result.replace(/~~([^~]+)~~/g, (_match, text) => {
    return DIM + text + RESET;
  });

  // Links ([text](url))
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, text, url) => {
    return UNDERLINE + BLUE + text + RESET + GRAY + " (" + url + ")" + RESET;
  });

  // Bare URLs
  result = result.replace(
    /(https?:\/\/[^\s]+)/g,
    (_match, url) => UNDERLINE + BLUE + url + RESET
  );

  return result;
}

/**
 * Strips all ANSI codes from a string (useful for testing or length calculation)
 */
export function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

/**
 * Simple markdown-to-plaintext converter (no formatting)
 */
export function markdownToPlaintext(markdown: string): string {
  let result = markdown;

  // Remove code blocks
  result = result.replace(/```[\s\S]*?```/g, (match) => {
    const lines = match.split("\n").slice(1, -1);
    return lines.map((l) => "  " + l).join("\n");
  });

  // Remove inline code backticks
  result = result.replace(/`([^`]+)`/g, "$1");

  // Remove bold/italic
  result = result.replace(/\*\*([^*]+)\*\*/g, "$1");
  result = result.replace(/__([^_]+)__/g, "$1");
  result = result.replace(/\*([^*]+)\*/g, "$1");
  result = result.replace(/_([^_]+)_/g, "$1");

  // Remove strikethrough
  result = result.replace(/~~([^~]+)~~/g, "$1");

  // Convert links to text + URL
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)");

  // Remove headers
  result = result.replace(/^#{1,6}\s+/gm, "");

  // Remove blockquotes
  result = result.replace(/^>\s*/gm, "");

  // Remove horizontal rules
  result = result.replace(/^(\*{3,}|-{3,}|_{3,})$/gm, "---");

  return result;
}
