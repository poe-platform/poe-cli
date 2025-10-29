import { describe, it, expect, vi, beforeEach } from "vitest";

beforeEach(() => {
  vi.resetModules();
});

describe("activate", () => {
  it("registers commands and the sidebar provider", async () => {
    const registerCommand = vi.fn(() => ({ dispose: vi.fn() }));
    const registerWebviewViewProvider = vi.fn(() => ({ dispose: vi.fn() }));
    const createStatusBarItem = vi.fn(() => ({
      show: vi.fn(),
      text: "",
      command: "",
      tooltip: "",
    }));

    vi.doMock("vscode", () => ({
      commands: {
        registerCommand,
        executeCommand: vi.fn(),
      },
      StatusBarAlignment: {
        Right: 1,
      },
      Uri: {
        joinPath: vi.fn((base, ...parts) => ({
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
    }));

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
