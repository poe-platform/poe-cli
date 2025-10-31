const path = require("node:path");

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    path.join(__dirname, "vscode-extension/src/webview/**/*.ts"),
    path.join(__dirname, "vscode-extension/src/webview/**/*.tsx"),
    path.join(__dirname, "vscode-extension/src/webview/**/*.html"),
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
