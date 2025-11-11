import { describe, it, expect, vi } from "vitest";

const openTextDocument = vi.fn(async () => ({
  uri: { fsPath: "/home/user/.poe-code/mcp.json" }
}));
const showTextDocument = vi.fn(async () => {});

vi.mock("vscode", () => ({
  workspace: {
    openTextDocument
  },
  window: {
    showTextDocument
  },
  Uri: {
    file: (value: string) => ({ fsPath: value })
  }
}));

describe("openMcpSettings", () => {
  it("opens MCP configuration file", async () => {
    const { openMcpSettings } = await import(
      "../vscode-extension/src/commands/open-mcp-settings.js"
    );

    await openMcpSettings({
      homeDir: "/home/user",
      filename: "mcp.json"
    });

    expect(openTextDocument).toHaveBeenCalledWith({
      fsPath: "/home/user/.poe-code/mcp.json"
    });
    expect(showTextDocument).toHaveBeenCalled();
  });
});
