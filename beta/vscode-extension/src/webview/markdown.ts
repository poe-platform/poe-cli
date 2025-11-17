const HTML_ESCAPE_TABLE: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
};

function escapeHtml(value: string): string {
  let result = "";
  for (const char of value) {
    result += HTML_ESCAPE_TABLE[char] ?? char;
  }
  return result;
}

function renderInlineMarkdown(text: string): string {
  let result = "";
  let bold = false;
  let italic = false;
  let code = false;
  for (let index = 0; index < text.length; ) {
    const char = text[index];
    const next = text[index + 1];

    if (char === "`") {
      result += code ? "</code>" : "<code>";
      code = !code;
      index += 1;
      continue;
    }

    if (code) {
      result += escapeHtml(char);
      index += 1;
      continue;
    }

    if (char === "*" && next === "*") {
      result += bold ? "</strong>" : "<strong>";
      bold = !bold;
      index += 2;
      continue;
    }

    if (char === "_" && !bold) {
      result += italic ? "</em>" : "<em>";
      italic = !italic;
      index += 1;
      continue;
    }

    result += escapeHtml(char);
    index += 1;
  }

  if (italic) {
    result += "</em>";
  }
  if (bold) {
    result += "</strong>";
  }
  if (code) {
    result += "</code>";
  }
  return result;
}

export function renderMarkdown(markdown: string): string {
  const lines = markdown.split("\n");
  const output: string[] = [];
  let inCodeBlock = false;
  let codeLanguage = "";
  const codeLines: string[] = [];

  const flushParagraph = (paragraphLines: string[]) => {
    if (paragraphLines.length === 0) {
      return;
    }
    const paragraph = paragraphLines.join(" ");
    output.push(`<p>${renderInlineMarkdown(paragraph)}</p>`);
    paragraphLines.length = 0;
  };

  const paragraphBuffer: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (line.startsWith("```")) {
      if (inCodeBlock) {
        output.push(
          `<pre><code class="language-${escapeHtml(codeLanguage)}">${codeLines
            .map(escapeHtml)
            .join("\n")}</code></pre>`
        );
        codeLines.length = 0;
        codeLanguage = "";
        inCodeBlock = false;
      } else {
        flushParagraph(paragraphBuffer);
        codeLanguage = line.slice(3).trim();
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(line);
      continue;
    }

    if (line.trim().length === 0) {
      flushParagraph(paragraphBuffer);
      continue;
    }

    paragraphBuffer.push(line);
  }

  if (paragraphBuffer.length > 0) {
    flushParagraph(paragraphBuffer);
  }

  if (codeLines.length > 0) {
    output.push(
      `<pre><code class="language-${escapeHtml(codeLanguage)}">${codeLines
        .map(escapeHtml)
        .join("\n")}</code></pre>`
    );
  }

  return output.join("");
}
