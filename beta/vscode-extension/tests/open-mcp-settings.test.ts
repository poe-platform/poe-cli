import { describe, it, expect, vi, beforeEach } from "vitest";

beforeEach(() => {
  vi.resetModules();
});

describe("openMcpSettings", () => {
  it("opens the MCP settings file in the editor", async () => {
    const openTextDocument = vi.fn().mockResolvedValue({ uri: { fsPath: "doc" } });
    const showTextDocument = vi.fn().mockResolvedValue(undefined);

    vi.doMock("vscode", () => ({
      Uri: {
        file: (target: string) => ({ fsPath: target }),
      },
      workspace: {
        openTextDocument,
      },
      window: {
        showTextDocument,
      },
    }));

    const { openMcpSettings } = await import(
      "../src/commands/open-mcp-settings.js"
    );

    await openMcpSettings({
      homeDir: "/Users/tester",
      filename: "mcp.json",
    });

    expect(openTextDocument).toHaveBeenCalledWith({
      fsPath: "/Users/tester/.poe-code/mcp.json",
    });
    expect(showTextDocument).toHaveBeenCalledWith({ uri: { fsPath: "doc" } });
  });
});
