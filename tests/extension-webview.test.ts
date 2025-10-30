import { describe, it, expect, vi, beforeEach } from "vitest";
import { JSDOM } from "jsdom";
import { renderAppShell } from "../vscode-extension/src/webview/layout.js";
import { renderModelSelector } from "../vscode-extension/src/webview/model-selector.js";
import type { ProviderSetting } from "../vscode-extension/src/config/provider-settings.js";
import { initializeWebviewApp } from "../vscode-extension/src/webview/runtime.js";

const providers: ProviderSetting[] = [
  { id: "anthropic", label: "Claude-Sonnet-4.5" },
  { id: "openai", label: "GPT-4.1" },
];

const shellHtml = renderAppShell({
  logoUrl: "vscode-resource:/poe-bw.svg",
  models: providers.map((provider) => provider.label),
  activeModel: providers[0]?.label ?? "",
});

const selectorHtml = renderModelSelector({
  models: providers.map((provider) => provider.label),
  selected: providers[0]?.label ?? "",
});

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

async function createDocument(): Promise<Document> {
  const { getWebviewContent } = await import("../vscode-extension/src/extension.js");
  const stubWebview = {
    cspSource: "vscode-resource:",
  };
  const html = getWebviewContent(stubWebview as any, {
    logoUri: "vscode-resource:/poe-bw.svg",
    appShellHtml: shellHtml,
    modelSelectorHtml: selectorHtml,
    providerSettings: providers,
    defaultModel: providers[0]?.label ?? "",
  });
  const dom = new JSDOM(html, { url: "https://localhost" });
  return dom.window.document;
}

describe("initializeWebviewApp", () => {
  let document: Document;
  let postMessage: ReturnType<typeof vi.fn>;
  let app: ReturnType<typeof initializeWebviewApp>;

  beforeEach(async () => {
    document = await createDocument();
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

  it("shows provider settings when opening the settings panel", () => {
    const settingsButton = document.querySelector("[data-action='open-settings']") as HTMLElement;
    settingsButton.dispatchEvent(new document.defaultView!.MouseEvent("click", { bubbles: true }));

    const panel = document.getElementById("settings-panel")!;
    expect(panel.classList.contains("hidden")).toBe(false);

    const providerItems = Array.from(
      document.querySelectorAll("#provider-settings .provider-item strong")
    ).map((item) => item.textContent?.trim());
    expect(providerItems).toEqual(["Claude-Sonnet-4.5", "GPT-4.1"]);
  });

  it("opens MCP configuration from the settings panel", () => {
    const settingsButton = document.querySelector("[data-action='open-settings']") as HTMLElement;
    settingsButton.dispatchEvent(new document.defaultView!.MouseEvent("click", { bubbles: true }));

    const openMcpButton = document.querySelector(
      "[data-action='settings-open-mcp']"
    ) as HTMLButtonElement;
    openMcpButton.dispatchEvent(
      new document.defaultView!.MouseEvent("click", { bubbles: true })
    );

    expect(postMessage).toHaveBeenCalledWith({ type: "openSettings" });
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

    app.handleMessage({
      type: "toolExecuted",
      toolName: "write_file",
      success: true
    });

    expect(entry.classList.contains("success")).toBe(true);
    expect(entry.textContent).toContain("completed");
  });
});
