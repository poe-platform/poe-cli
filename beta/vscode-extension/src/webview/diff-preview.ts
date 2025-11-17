interface DiffPreviewOptions {
  previous: string;
  next: string;
  language: string;
  filename: string;
}

export function renderDiffPreview(options: DiffPreviewOptions): string {
  const previousLines = options.previous.split("\n");
  const nextLines = options.next.split("\n");
  const rows: string[] = [];
  const maxLength = Math.max(previousLines.length, nextLines.length);

  for (let index = 0; index < maxLength; index += 1) {
    const before = previousLines[index] ?? "";
    const after = nextLines[index] ?? "";
    if (before === after) {
      rows.push(
        `<div class="diff-row"><code class="diff-context">${escapeHtml(
          before
        )}</code></div>`
      );
      continue;
    }
    if (before.length > 0) {
      rows.push(
        `<div class="diff-row"><code class="diff-removed">${escapeHtml(
          before
        )}</code></div>`
      );
    }
    if (after.length > 0) {
      rows.push(
        `<div class="diff-row"><code class="diff-added">${escapeHtml(
          after
        )}</code></div>`
      );
    }
  }

  return `
    <section class="diff-preview" data-language="${options.language}">
      <header class="diff-header">${escapeHtml(options.filename)}</header>
      <div class="diff-body">
        ${rows.join("")}
      </div>
    </section>
  `;
}

const HTML_SAFE: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
};

function escapeHtml(value: string): string {
  let result = "";
  for (const char of value) {
    result += HTML_SAFE[char] ?? char;
  }
  return result;
}

