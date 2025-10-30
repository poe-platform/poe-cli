import { describe, it, expect, vi } from "vitest";
import { Window } from "happy-dom";
import { initializeWebviewApp } from "../src/webview/runtime.js";

function createDocument() {
  const window = new Window();
  const document = window.document;
  document.body.innerHTML = `
    <div data-slot="app-shell">
      <nav>
        <button type="button" data-action="strategy-open">Strategy</button>
        <button type="button" data-action="new-chat">New</button>
      </nav>
    </div>
    <div data-slot="model-selector"></div>
    <div id="messages">
      <div class="welcome-message">
        <button type="button" data-action="strategy-open">Configure</button>
      </div>
    </div>
    <section id="strategy-modal" class="strategy-modal hidden" aria-hidden="true">
      <div class="strategy-surface">
        <button type="button" class="strategy-close" data-action="strategy-close">Close</button>
        <button type="button" id="strategy-toggle" role="switch" aria-checked="false">
          <span class="strategy-thumb"></span>
        </button>
        <div class="strategy-options">
          <button type="button" class="strategy-option" data-strategy="smart"></button>
          <button type="button" class="strategy-option" data-strategy="mixed"></button>
          <button type="button" class="strategy-option" data-strategy="round-robin"></button>
          <button type="button" class="strategy-option" data-strategy="fixed"></button>
        </div>
      </div>
    </div>
    <textarea id="message-input"></textarea>
    <button id="send-button"></button>
    <button id="clear-button"></button>
    <div id="thinking-indicator" class="hidden"></div>
    <span id="model-badge"></span>
    <span id="strategy-badge"></span>
    <div id="tool-notifications"></div>
    <div id="settings-panel" class="hidden">
      <button data-action="settings-close"></button>
      <button data-action="settings-open-mcp"></button>
      <div id="provider-settings"></div>
    </div>
  `;
  return { document, window };
}

describe("initializeWebviewApp", () => {
  it("routes sendMessage events and renders assistant messages", () => {
    const { document } = createDocument();
    const postMessage = vi.fn();

    const app = initializeWebviewApp({
      document,
      appShellHtml: `
        <aside class="sidebar">
          <ul class="model-list"></ul>
        </aside>
      `,
      modelSelectorHtml: `
        <div>
          <input id="model-search" />
          <datalist id="model-list"></datalist>
        </div>
      `,
      providerSettings: [],
      defaultModel: "Baseline",
      logoUrl: "logo.svg",
      postMessage,
    });

    const messageInput = document.getElementById(
      "message-input"
    ) as HTMLTextAreaElement;
    const sendButton = document.getElementById(
      "send-button"
    ) as HTMLButtonElement;
    messageInput.value = "Hello Poe";
    sendButton.click();

    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "sendMessage",
        text: "Hello Poe",
      })
    );

    app.handleMessage({
      type: "message",
      role: "assistant",
      html: "<p>Hi there!</p>",
      model: "Model-X",
    });

    const assistantMessages = document.querySelectorAll(
      ".message-wrapper.assistant"
    );
    expect(assistantMessages).toHaveLength(1);
    expect(assistantMessages[0].innerHTML).toContain("Hi there!");
  });

  it("sends strategy updates when toggled or selecting options", () => {
    const { document } = createDocument();
    const postMessage = vi.fn();

    initializeWebviewApp({
      document,
      appShellHtml: `
        <nav>
          <button data-action="strategy-open">Strategy</button>
        </nav>
      `,
      modelSelectorHtml: "<div></div>",
      providerSettings: [],
      defaultModel: "Baseline",
      logoUrl: "logo.svg",
      postMessage,
    });

    const openButton = document.querySelector(
      "[data-action='strategy-open']"
    ) as HTMLButtonElement;
    openButton.click();
    const strategyModal = document.getElementById("strategy-modal") as HTMLElement;
    expect(strategyModal.classList.contains("hidden")).toBe(false);
    expect(postMessage).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ type: "getStrategyStatus" })
    );

    const toggle = document.getElementById("strategy-toggle") as HTMLElement;
    toggle.click();
    expect(postMessage).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ type: "toggleStrategy", enabled: true })
    );

    const smartOption = document.querySelector(
      ".strategy-option[data-strategy='smart']"
    ) as HTMLElement;
    smartOption.click();
    expect(postMessage).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        type: "setStrategy",
        config: expect.objectContaining({ type: "smart" }),
      })
    );
  });

  it("updates the strategy badge when receiving status messages", () => {
    const { document } = createDocument();
    const postMessage = vi.fn();

    const app = initializeWebviewApp({
      document,
      appShellHtml: "<div></div>",
      modelSelectorHtml: "<div></div>",
      providerSettings: [],
      defaultModel: "Baseline",
      logoUrl: "logo.svg",
      postMessage,
    });

    const badge = document.getElementById("strategy-badge") as HTMLElement;
    expect(badge.textContent).toBe("");

    app.handleMessage({
      type: "strategyStatus",
      enabled: true,
      info: "smart: rotates models",
      currentModel: "GPT-5",
    });

    expect(badge.textContent).toContain("Smart");
    expect(badge.dataset.state).toBe("enabled");
  });
});
