import { describe, it, expect, vi } from "vitest";
import { Window } from "happy-dom";
import { initializeWebviewApp } from "../src/webview/runtime.js";

function createDocument() {
  const window = new Window();
  const document = window.document;
  document.body.innerHTML = `
    <header data-slot="app-shell"></header>
    <div id="messages"></div>
    <textarea id="message-input"></textarea>
    <button id="send-button"></button>
    <div class="composer"></div>
    <div id="thinking-indicator" class="hidden"></div>
    <div id="tool-notifications"></div>
    <div id="chat-history" class="hidden">
      <button data-action="history-close"></button>
      <div class="chat-history-content"></div>
    </div>
    <div id="settings-view" class="hidden">
      <poe-settings-panel id="settings-panel"></poe-settings-panel>
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
          <button data-action="open-settings">Settings</button>
        </aside>
      `,
      providerSettings: [],
      modelOptions: ["Baseline"],
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

  it("sends strategy updates when toggled or selecting options", async () => {
    const { document, window } = createDocument();
    const postMessage = vi.fn();

    initializeWebviewApp({
      document,
      appShellHtml: `
        <nav>
          <button data-action="open-settings">Settings</button>
        </nav>
      `,
      providerSettings: [],
      modelOptions: ["Baseline"],
      defaultModel: "Baseline",
      logoUrl: "logo.svg",
      postMessage,
    });

    const openButton = document.querySelector(
      "[data-action='open-settings']"
    ) as HTMLButtonElement;
    openButton.click();

    const settingsPanel = document.getElementById("settings-panel") as HTMLElement & {
      updateComplete?: Promise<unknown>;
      shadowRoot: ShadowRoot;
    };
    await (settingsPanel as any).updateComplete;

    expect(postMessage).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ type: "getStrategyStatus" })
    );

    settingsPanel.dispatchEvent(
      new window.CustomEvent("strategy-toggle", {
        detail: { enabled: true },
        bubbles: true,
        composed: true,
      })
    );
    expect(postMessage).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ type: "toggleStrategy", enabled: true })
    );

    settingsPanel.dispatchEvent(
      new window.CustomEvent("strategy-change", {
        detail: { config: { type: "smart" } },
        bubbles: true,
        composed: true,
      })
    );
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
      providerSettings: [],
      modelOptions: ["Baseline"],
      defaultModel: "Baseline",
      logoUrl: "logo.svg",
      postMessage,
    });

    const settingsPanel = document.getElementById("settings-panel") as HTMLElement & {
      strategyEnabled?: boolean;
      strategyInfo?: string;
      strategyType?: string;
      activeModel?: string;
    };
    expect(settingsPanel.strategyEnabled).toBe(undefined);

    app.handleMessage({
      type: "strategyStatus",
      enabled: true,
      info: "smart: rotates models",
      currentModel: "GPT-5.1",
    });

    expect(settingsPanel.strategyEnabled).toBe(true);
    expect(settingsPanel.strategyInfo).toContain("smart");
    expect(settingsPanel.strategyType).toBe("smart");
    expect(settingsPanel.activeModel).toBe("GPT-5.1");
  });
});
