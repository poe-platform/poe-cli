import { describe, it, expect, vi, beforeEach } from "vitest";

beforeEach(() => {
  vi.resetModules();
  vi.doMock("vscode", () => ({
    Uri: {
      joinPath: (base: any, ...parts: string[]) => ({
        fsPath: [base?.fsPath ?? base, ...parts].join("/"),
        toString: () => [base?.fsPath ?? base, ...parts].join("/"),
      }),
      file: (path: string) => ({
        fsPath: path,
        toString: () => path,
      }),
    },
    StatusBarAlignment: {
      Right: 1,
    },
    window: {},
    commands: {},
    workspace: {
      getConfiguration: () => ({ get: () => "Model" }),
      workspaceFolders: [],
    },
  }));
});

describe("getWebviewContent", () => {
  it("allows overriding CSP and injecting additional scripts", async () => {
    const { getWebviewContent } = await import("../src/extension.js");
    const html = getWebviewContent(
      {
        cspSource: "self",
        asWebviewUri: (uri: any) => ({
          toString: () => String(uri),
        }),
      } as any,
      {
        logoUri: "logo.png",
        appShellHtml: "<div>shell</div>",
        providerSettings: [],
        modelOptions: ["Model"],
        defaultModel: "Model",
        bodyStartHtml: "<div id='preview-banner'></div>",
        additionalScripts: ["window.__preview__ = true;"],
        additionalCspDirectives: ["connect-src ws: wss:"],
      }
    );

    expect(html).toContain("window.__preview__ = true;");
    expect(html).toContain("connect-src ws: wss:");
    expect(html).toContain("<div>shell</div>");
    expect(html).toContain("<div id='preview-banner'></div>");
  });
});
