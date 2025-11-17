/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./vscode-extension/src/webview/**/*.{ts,tsx,html}",
  ],
  safelist: [
    {
      pattern:
        /(bg|text|border|ring|hover:bg|hover:text|hover:border|focus:border|focus-visible:ring)-(surface|surface-raised|text|text-muted|border|accent|accent-fg|success|error)/,
    },
    {
      pattern:
        /(shadow|rounded)-(sm|md|lg|xl|2xl)/,
    },
  ],
  theme: {
    extend: {
      colors: {
        surface: { DEFAULT: "var(--surface)", raised: "var(--surface-raised)" },
        text: { DEFAULT: "var(--text)", muted: "var(--text-muted)" },
        border: "var(--border)",
        accent: { DEFAULT: "var(--accent)", fg: "var(--accent-fg)" },
        success: "var(--success)",
        error: "var(--error)",
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "'Segoe UI'",
          "Roboto",
          "Oxygen",
          "Ubuntu",
          "Cantarell",
          "'Open Sans'",
          "'Helvetica Neue'",
          "sans-serif",
        ],
        mono: [
          "'SFMono-Regular'",
          "Menlo",
          "Monaco",
          "Consolas",
          "'Liberation Mono'",
          "'Courier New'",
          "monospace",
        ],
      },
      boxShadow: {
        panel: "0 16px 48px rgba(0, 0, 0, 0.35)",
      },
    },
  },
  plugins: [],
};
