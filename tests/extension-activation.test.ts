import { describe, it, expect, vi, beforeEach } from "vitest";

const showInformationMessage = vi.fn();
const showWarningMessage = vi.fn();
const createStatusBarItem = vi.fn(() => ({
  text: "",
  tooltip: "",
  command: "",
  show: vi.fn(),
  dispose: vi.fn()
}));
const registerCommand = vi.fn(() => ({ dispose: vi.fn() }));
const registerTextEditorCommand = vi.fn(() => ({ dispose: vi.fn() }));
const openTextDocument = vi.fn();
const showTextDocument = vi.fn();
const showSaveDialog = vi.fn();

vi.mock("vscode", () => ({
  window: {
    showInformationMessage,
    showWarningMessage,
    createStatusBarItem,
    showSaveDialog
  },
  commands: {
    registerCommand,
    registerTextEditorCommand
  },
  workspace: {
    getConfiguration: vi.fn(() => ({
      update: vi.fn()
    })),
    openTextDocument
  },
  Uri: {
    parse: (value: string) => ({ toString: () => value }),
    joinPath: (...parts: string[]) => ({
      toString: () => parts.join("/")
    }),
    file: (value: string) => ({ fsPath: value })
  },
  ViewColumn: {
    One: 1
  },
  StatusBarAlignment: {
    Right: 1
  },
  extensions: {
    getExtension: vi.fn()
  }
}));

beforeEach(() => {
  showInformationMessage.mockClear();
  showWarningMessage.mockClear();
  registerCommand.mockClear();
  registerTextEditorCommand.mockClear();
});

describe("extension activation", () => {
  it("does not display installation notification on activation", async () => {
    const { activate } = await import("../vscode-extension/src/extension.js");
    const context = {
      extensionUri: { fsPath: "/tmp" },
      globalState: {
        get: vi.fn(() => false),
        update: vi.fn()
      },
      subscriptions: []
    };

    await activate(context as any);

    expect(showInformationMessage).not.toHaveBeenCalled();
    expect(
      registerCommand.mock.calls.some(([command]) => command === "poe-code.settings.openMcp")
    ).toBe(true);
  });
});
