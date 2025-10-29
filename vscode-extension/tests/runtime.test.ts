import { describe, it, expect, vi } from "vitest";
import { Window } from "happy-dom";
import { initializeWebviewApp } from "../src/webview/runtime.js";

function createDocument() {
  const window = new Window();
  const document = window.document;
  document.body.innerHTML = `
    <div data-slot="app-shell"></div>
    <div data-slot="model-selector"></div>
    <div id="messages"></div>
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
});
