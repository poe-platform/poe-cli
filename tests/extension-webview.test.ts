import { describe, it, expect, vi, beforeEach } from "vitest";
import { JSDOM } from "jsdom";
import { renderAppShell } from "../vscode-extension/src/webview/layout.js";
import { renderModelSelector } from "../vscode-extension/src/webview/model-selector.js";
import type { ProviderSetting } from "../vscode-extension/src/config/provider-settings.js";
import { initializeWebviewApp } from "../vscode-extension/src/webview/runtime.js";

function createDocument(): Document {
  const dom = new JSDOM(
    `
    <body>
      <div class="poe-layout">
        <aside class="sidebar-wrapper" data-slot="app-shell"></aside>
        <main class="main-pane">
          <header class="status-bar">
            <div class="status-left">
              <span id="model-badge" class="model-badge"></span>
              <span id="strategy-badge" class="strategy-badge"></span>
            </div>
            <div id="model-selector" data-slot="model-selector"></div>
          </header>
          <section id="chat-container" class="chat-scroll">
            <div id="messages">
              <div class="welcome-message">Welcome</div>
            </div>
          </section>
          <footer class="composer">
            <textarea id="message-input"></textarea>
            <div class="composer-actions">
              <button id="clear-button" type="button">Clear</button>
              <button id="send-button" type="button">Send</button>
            </div>
          </footer>
          <div id="tool-notifications"></div>
        </main>
      </div>
    </body>
  `,
    { url: "https://localhost" }
  );
  return dom.window.document;
}

describe("initializeWebviewApp", () => {
  const providers: ProviderSetting[] = [
    { id: "anthropic", label: "Claude-Sonnet-4.5" },
    { id: "openai", label: "GPT-4.1" }
  ];

  const shellHtml = renderAppShell({
    logoUrl: "vscode-resource:/poe-bw.svg",
    models: providers.map((provider) => provider.label),
    activeModel: providers[0]?.label ?? ""
  });

  const selectorHtml = renderModelSelector({
    models: providers.map((provider) => provider.label),
    selected: providers[0]?.label ?? ""
  });

  let document: Document;
  let postMessage: ReturnType<typeof vi.fn>;
  let app: ReturnType<typeof initializeWebviewApp>;

  beforeEach(() => {
    document = createDocument();
    postMessage = vi.fn();
    app = initializeWebviewApp({
      document,
      appShellHtml: shellHtml,
      modelSelectorHtml: selectorHtml,
      providerSettings: providers,
      defaultModel: providers[0]?.label ?? "",
      logoUrl: "vscode-resource:/poe-bw.svg",
      postMessage
    });
  });

  it("renders provider models inside the navigation list", () => {
    const items = Array.from(
      document.querySelectorAll(".model-item")
    ).map((item) => item.textContent?.trim());
    expect(items).toEqual(["Claude-Sonnet-4.5", "GPT-4.1"]);
  });

  it("publishes model change when selecting a model from the list", () => {
    const secondItem = document.querySelectorAll(".model-item")[1] as HTMLElement;
    secondItem.dispatchEvent(new document.defaultView!.MouseEvent("click", { bubbles: true }));
    expect(postMessage).toHaveBeenCalledWith({
      type: "setModel",
      model: "GPT-4.1"
    });
  });

  it("sends clear signal and resets history snapshot", () => {
    const clearButton = document.getElementById("clear-button") as HTMLButtonElement;
    clearButton.dispatchEvent(new document.defaultView!.MouseEvent("click", { bubbles: true }));
    expect(postMessage).toHaveBeenCalledWith({ type: "clearHistory" });

    document.getElementById("messages")!.innerHTML = "<div>Test</div>";
    app.handleMessage({ type: "historyCleared" });
    expect(document.getElementById("messages")!.innerHTML).toContain("welcome-message");
  });

  it("appends diff previews inline within the conversation", () => {
    app.handleMessage({
      type: "diffPreview",
      html: '<section class="diff-preview"><div class="diff-row"></div></section>'
    });
    const previews = document.querySelectorAll("#messages .diff-preview");
    expect(previews.length).toBe(1);
  });

  it("renders assistant markdown messages inline", () => {
    app.handleMessage({
      type: "message",
      role: "assistant",
      model: "Claude-Sonnet-4.5",
      html: "<p><strong>Bold</strong> response</p>"
    });

    const assistantBubble = document.querySelector(".message-wrapper.assistant .message-content");
    expect(assistantBubble?.innerHTML).toContain("<strong>Bold</strong>");
  });
});
