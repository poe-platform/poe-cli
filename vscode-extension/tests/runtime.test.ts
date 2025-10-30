import { describe, it, expect, vi } from "vitest";
import { Window } from "happy-dom";
import { initializeWebviewApp } from "../src/webview/runtime.js";

function createDocument() {
  const window = new Window();
  const doc = window.document;
  doc.body.innerHTML = `
    <div id="app-root" data-page="chat">
      <div data-slot="app-shell"></div>
      <div data-slot="model-selector"></div>
      <main class="poe-main">
        <section id="chat-view" class="view chat-view">
          <div id="messages"></div>
          <div id="thinking-indicator" class="hidden"></div>
        </section>
        <section id="history-panel" class="view history-view hidden">
          <div data-history-empty>Empty</div>
          <div data-history-list></div>
        </section>
      </main>
      <textarea id="message-input"></textarea>
      <button id="send-button"></button>
      <button id="clear-button"></button>
      <span id="model-badge"></span>
      <span id="strategy-badge"></span>
      <div id="tool-notifications"></div>
      <div id="settings-panel" class="hidden">
        <button data-action="settings-close"></button>
        <button data-action="settings-open-mcp"></button>
        <div id="provider-settings"></div>
      </div>
    </div>
  `;
  return { document: doc, window };
}

describe("initializeWebviewApp", () => {
  it("routes sendMessage events and renders assistant messages", () => {
    const { document } = createDocument();
    const postMessage = vi.fn();

    const app = initializeWebviewApp({
      document,
      appShellHtml: `
        <header class="app-header">
          <nav class="app-nav">
            <button data-action="new-message"></button>
            <button data-action="open-settings"></button>
            <button data-action="open-history"></button>
          </nav>
        </header>
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
      postMessage
    });

    const messageInput = document.getElementById("message-input") as HTMLTextAreaElement;
    const sendButton = document.getElementById("send-button") as HTMLButtonElement;
    messageInput.value = "Hello Poe";
    sendButton.click();

    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "sendMessage",
        text: "Hello Poe"
      })
    );

    app.handleMessage({
      type: "message",
      role: "assistant",
      html: "<p>Hi there!</p>",
      model: "Model-X"
    });

    const assistantMessages = document.querySelectorAll(".message-wrapper.assistant");
    expect(assistantMessages).toHaveLength(1);
    expect(assistantMessages[0].innerHTML).toContain("Hi there!");
  });
});
