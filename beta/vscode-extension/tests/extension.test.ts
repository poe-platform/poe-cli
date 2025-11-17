import { describe, it, expect, vi, beforeEach } from "vitest";
import { Script } from "node:vm";

beforeEach(() => {
  vi.resetModules();
});

function setupVscodeMock() {
  const registerCommand = vi.fn(() => ({ dispose: vi.fn() }));
  const registerWebviewViewProvider = vi.fn(() => ({ dispose: vi.fn() }));
  const createStatusBarItem = vi.fn(() => ({
    show: vi.fn(),
    text: "",
    command: "",
    tooltip: "",
  }));

  const vscodeMock = {
    commands: {
      registerCommand,
      executeCommand: vi.fn(),
    },
    StatusBarAlignment: {
      Right: 1,
    },
    Uri: {
      joinPath: vi.fn((base: any, ...parts: string[]) => ({
        fsPath: [base.fsPath ?? base, ...parts].join("/"),
        toString: () => "uri",
      })),
      file: vi.fn(),
    },
    window: {
      registerWebviewViewProvider,
      createStatusBarItem,
      showInformationMessage: vi.fn(),
      showWarningMessage: vi.fn(),
      showInputBox: vi.fn(),
      createTerminal: vi.fn(() => ({ show: vi.fn(), sendText: vi.fn() })),
      showErrorMessage: vi.fn(),
    },
    workspace: {
      getConfiguration: vi.fn(() => ({ get: () => "Claude" })),
      workspaceFolders: [],
    },
  };

  vi.doMock("vscode", () => vscodeMock);

  return {
    registerCommand,
    registerWebviewViewProvider,
    createStatusBarItem,
    vscodeMock,
  };
}

describe("activate", () => {
  it("registers commands and the sidebar provider", async () => {
    const { registerCommand, registerWebviewViewProvider } = setupVscodeMock();

    const { activate } = await import("../src/extension.js");

    const subscriptions: { dispose: () => void }[] = [];
    await activate({
      extensionUri: { fsPath: "/ext" },
      subscriptions,
      globalState: {
        get: vi.fn(() => true),
        update: vi.fn(),
      },
    } as any);

    expect(registerWebviewViewProvider).toHaveBeenCalledWith(
      "poeCodeSidebar",
      expect.any(Object)
    );
    expect(registerCommand).toHaveBeenCalledWith(
      "poe-code.editor.open",
      expect.any(Function)
    );
    expect(registerCommand).toHaveBeenCalledWith(
      "poe-code.sidebar.open",
      expect.any(Function)
    );
  });
});

describe("getWebviewContent", () => {
  it("produces a bootstrapping script without syntax errors", async () => {
    setupVscodeMock();

    const { getWebviewContent } = await import("../src/extension.js");

    const mockWebview = {
      cspSource: "vscode-resource",
      asWebviewUri: (uri: unknown) => ({
        toString: () => String(uri),
      }),
    };

    const html = getWebviewContent(mockWebview as any, {
      logoUri: "logo",
      appShellHtml: "<div>shell</div>",
      providerSettings: [],
      modelOptions: ["Model"],
      defaultModel: "Model",
    });

    const scriptOpen = html.indexOf("<script");
    expect(scriptOpen).toBeGreaterThanOrEqual(0);
    const tagEnd = html.indexOf(">", scriptOpen);
    expect(tagEnd).toBeGreaterThan(scriptOpen);
    const scriptClose = html.indexOf("</script>", tagEnd);
    expect(scriptClose).toBeGreaterThan(tagEnd);
    const scriptText = html.slice(tagEnd + 1, scriptClose);

    expect(() => new Script(scriptText)).not.toThrow();
  });

  it("renders an enhanced welcome layout with feature highlights", async () => {
    setupVscodeMock();

    const { getWebviewContent } = await import("../src/extension.js");
    const mockWebview = {
      cspSource: "vscode-resource",
      asWebviewUri: (uri: unknown) => ({
        toString: () => String(uri),
      }),
    };

    const html = getWebviewContent(mockWebview as any, {
      logoUri: "logo",
      appShellHtml: "<div>shell</div>",
      providerSettings: [],
      modelOptions: ["Model"],
      defaultModel: "Model",
    });

    expect(html).toContain('class="welcome-grid"');
    expect(html).toContain('data-feature="strategies"');
    expect(html).toContain('data-feature="models"');
    expect(html).toContain('data-feature="tools"');
  });
});
