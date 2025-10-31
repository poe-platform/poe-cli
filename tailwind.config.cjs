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
        surface: "var(--vscode-editor-background)",
        "surface-muted": "var(--vscode-editorWidget-background)",
        outline: "var(--vscode-panel-border)",
        accent: "var(--vscode-focusBorder)",
        text: "var(--vscode-editor-foreground)",
        subtle: "var(--vscode-descriptionForeground)",
        button: "var(--vscode-button-background)",
        "button-foreground": "var(--vscode-button-foreground)",
        danger: "var(--vscode-errorForeground)",
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
