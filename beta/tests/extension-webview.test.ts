import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Window } from "happy-dom";
import { renderAppShell } from "../vscode-extension/src/webview/layout.js";
import type { ProviderSetting } from "../vscode-extension/src/config/provider-settings.js";
import type { WebviewApp } from "../vscode-extension/src/webview/runtime.js";

const providers: ProviderSetting[] = [
  { id: "anthropic", label: "Claude-Sonnet-4.5" },
  { id: "openai", label: "GPT-4.1" },
];

const shellHtml = renderAppShell({
  logoUrl: "vscode-resource:/poe-bw.svg",
  models: providers.map((provider) => provider.label),
  activeModel: providers[0]?.label ?? "",
});

const modelOptions = providers.map((provider) => provider.label);

vi.mock("vscode", () => {
  const noop = () => undefined;
  const disposable = () => ({ dispose: noop });
  return {
    commands: {
      registerCommand: vi.fn(disposable),
      executeCommand: vi.fn(),
    },
    window: {
      registerWebviewViewProvider: vi.fn(disposable),
      createStatusBarItem: vi.fn(() => ({ show: vi.fn(), command: "", text: "", tooltip: "" })),
      showInformationMessage: vi.fn(),
      showWarningMessage: vi.fn(),
      showInputBox: vi.fn(),
      createTerminal: vi.fn(() => ({ show: vi.fn(), sendText: vi.fn(), dispose: vi.fn() })),
      onDidCloseTerminal: vi.fn(),
      showErrorMessage: vi.fn(),
      showTextDocument: vi.fn(),
    },
    workspace: {
      getConfiguration: vi.fn(() => ({ get: () => "Claude-Sonnet-4.5" })),
      workspaceFolders: [],
      openTextDocument: vi.fn(),
    },
    Uri: {
      joinPath: (_base: any, ...parts: string[]) => ({
        fsPath: parts.join("/"),
        toString: () => `vscode-resource:/${parts.join("/")}`,
      }),
      file: (target: string) => ({ fsPath: target }),
    },
    StatusBarAlignment: { Right: 1 },
    ThemeIcon: class {},
  };
});

async function createEnvironment(): Promise<Window> {
  const { getWebviewContent } = await import("../vscode-extension/src/extension.js");
  const stubWebview = {
    cspSource: "vscode-resource:",
  };
  const html = getWebviewContent(stubWebview as any, {
    logoUri: "vscode-resource:/poe-bw.svg",
    appShellHtml: shellHtml,
    providerSettings: providers,
    modelOptions,
    defaultModel: providers[0]?.label ?? "",
  });
  const window = new Window();
  window.document.write(html);
  return window;
}

async function openSettings(document: Document) {
  const trigger = document.querySelector(
    "[data-action='open-settings']"
  ) as HTMLButtonElement;
  trigger.click();
  const panel = document.getElementById("settings-panel") as HTMLElement & {
    updateComplete?: Promise<unknown>;
    shadowRoot: ShadowRoot;
    open: boolean;
  };
  if ((panel as any).updateComplete) {
    await (panel as any).updateComplete;
  } else {
    await Promise.resolve();
  }
  return panel;
}

describe("initializeWebviewApp", () => {
  let document: Document;
  let windowRef: Window;
  let postMessage: ReturnType<typeof vi.fn>;
  let app: WebviewApp;
  let initializeWebviewApp: typeof import("../vscode-extension/src/webview/runtime.js").initializeWebviewApp;

  beforeEach(async () => {
    windowRef = await createEnvironment();
    document = windowRef.document;
    Object.assign(globalThis, {
      window: windowRef as unknown as Window & typeof globalThis,
      document,
      CustomEvent: windowRef.CustomEvent,
      Event: windowRef.Event,
      MouseEvent: windowRef.MouseEvent,
      HTMLElement: windowRef.HTMLElement,
      customElements: windowRef.customElements,
    });
    vi.resetModules();
    ({ initializeWebviewApp } = await import("../vscode-extension/src/webview/runtime.js"));
    postMessage = vi.fn();
    app = initializeWebviewApp({
      document,
      appShellHtml: shellHtml,
      providerSettings: providers,
      modelOptions,
      defaultModel: providers[0]?.label ?? "",
      logoUrl: "vscode-resource:/poe-bw.svg",
      postMessage
    });
  });

  afterEach(() => {
    delete (globalThis as any).window;
    delete (globalThis as any).document;
    delete (globalThis as any).CustomEvent;
    delete (globalThis as any).Event;
    delete (globalThis as any).MouseEvent;
    delete (globalThis as any).HTMLElement;
    delete (globalThis as any).customElements;
  });

  it("registers provider metadata on the settings panel", () => {
    const panel = document.getElementById("settings-panel") as any;
    expect(panel.providers).toEqual(providers);
  });

  it("publishes model change when selecting provider inside the settings panel", async () => {
    const panel = await openSettings(document);
    postMessage.mockClear();

    panel.dispatchEvent(
      new document.defaultView!.CustomEvent("model-change", {
        detail: { model: "GPT-4.1" },
        bubbles: true,
        composed: true,
      })
    );

    expect(postMessage).toHaveBeenCalledWith({
      type: "setModel",
      model: "GPT-4.1"
    });
  });

  it("sends clear signal and resets history snapshot via new chat control", () => {
    const newChat = document.querySelector("[data-action='new-chat']") as HTMLButtonElement;
    newChat.dispatchEvent(new document.defaultView!.MouseEvent("click", { bubbles: true }));
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

  it("marks the settings panel open when triggered", async () => {
    const panel = await openSettings(document);
    expect(panel.open).toBe(true);
  });

  it("disables the composer and shows stop while responding", () => {
    const sendButton = document.getElementById("send-button") as HTMLButtonElement;
    const stopButton = document.getElementById("stop-button") as HTMLButtonElement;
    const messageInput = document.getElementById("message-input") as HTMLTextAreaElement;

    expect(stopButton.classList.contains("hidden")).toBe(true);

    app.handleMessage({ type: "responding", value: true });

    expect(messageInput.disabled).toBe(true);
    expect(sendButton.classList.contains("hidden")).toBe(true);
    expect(stopButton.classList.contains("hidden")).toBe(false);

    app.handleMessage({ type: "responding", value: false });

    expect(messageInput.disabled).toBe(false);
    expect(sendButton.classList.contains("hidden")).toBe(false);
    expect(stopButton.classList.contains("hidden")).toBe(true);
  });

  it("sends a stop request when stop is clicked", () => {
    const stopButton = document.getElementById("stop-button") as HTMLButtonElement;
    app.handleMessage({ type: "responding", value: true });
    stopButton.click();

    expect(postMessage).toHaveBeenCalledWith({ type: "stopResponse" });
  });

  it("opens MCP configuration from the settings panel", async () => {
    const panel = await openSettings(document);
    postMessage.mockClear();

    panel.dispatchEvent(
      new document.defaultView!.CustomEvent("open-mcp", {
        bubbles: true,
        composed: true,
      })
    );

    expect(postMessage).toHaveBeenCalledWith({ type: "openSettings" });
    expect(panel.open).toBe(false);
  });

  it("interleaves tool call updates in the transcript", () => {
    app.handleMessage({
      type: "toolStarting",
      toolName: "write_file",
      args: { path: "index.ts" }
    });

    const toolMessages = Array.from(
      document.querySelectorAll(".message-wrapper.tool")
    );
    expect(toolMessages.length).toBe(1);
    const entry = toolMessages[0]!;
    expect(entry.textContent).toContain("write_file");
    expect(entry.classList.contains("running")).toBe(true);

    const details = entry.querySelector("details");
    expect(details).toBeTruthy();
    expect(details?.open).toBe(false);

    const summary = details?.querySelector("summary");
    expect(summary?.textContent?.toLowerCase()).toContain("details");

    const argKey = entry.querySelector(".message-tool-args dt");
    expect(argKey?.textContent).toBe("path");

    const argValue = entry.querySelector(".message-tool-args dd");
    expect(argValue?.textContent).toContain("index.ts");

    app.handleMessage({
      type: "toolExecuted",
      toolName: "write_file",
      success: true,
      result: { bytesWritten: 32 }
    });

    expect(entry.classList.contains("success")).toBe(true);
    expect(entry.textContent).toContain("completed");

    const responseBlock = entry.querySelector(".message-tool-response");
    expect(responseBlock?.textContent).toContain("bytesWritten");
    expect(responseBlock?.textContent).toContain("32");
  });
});
