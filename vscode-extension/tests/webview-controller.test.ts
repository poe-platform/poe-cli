import { describe, it, expect, vi } from "vitest";
import { createWebviewController } from "../src/webview/controller.js";

function createStubWebview() {
  const posts: unknown[] = [];
  return {
    api: {
      postMessage: vi.fn((payload: unknown) => {
        posts.push(payload);
        return true;
      }),
    },
    posts,
  };
}

function createStubChatService() {
  return {
    getModel: vi.fn(() => "Claude-Sonnet-4.5"),
    clearHistory: vi.fn(),
    sendMessage: vi.fn<
      Promise<{ id?: string; content?: string }>[],
      [string, unknown[]]
    >(() =>
      Promise.resolve({
        id: "assistant-1",
        content: "Hello from Poe",
      })
    ),
    isStrategyEnabled: vi.fn(() => false),
    getStrategyInfo: vi.fn(() => "Strategy disabled"),
    setStrategy: vi.fn(),
  };
}

describe("createWebviewController", () => {
  it("routes user messages through the chat service and echoes responses", async () => {
    const webview = createStubWebview();
    const chatService = createStubChatService();
    const onUserMessage = vi.fn();
    const onAssistantMessage = vi.fn();

    const controller = createWebviewController({
      chatService,
      webview: webview.api,
      renderMarkdown: (text: string) => `<p>${text}</p>`,
      availableTools: [{ name: "noop" }],
      onUserMessage,
      onAssistantMessage,
    });

    await controller.handleWebviewMessage({
      type: "sendMessage",
      id: "m-1",
      text: "Hello Poe",
    });

    expect(chatService.sendMessage).toHaveBeenCalledWith("Hello Poe", [
      { name: "noop" },
    ]);

    expect(webview.api.postMessage).toHaveBeenCalledWith({
      type: "thinking",
      value: true,
    });

    expect(webview.api.postMessage).toHaveBeenCalledWith({
      type: "message",
      role: "user",
      id: "m-1",
      html: "<p>Hello Poe</p>",
      model: "Claude-Sonnet-4.5",
    });

    expect(webview.api.postMessage).toHaveBeenCalledWith({
      type: "message",
      role: "assistant",
      id: "assistant-1",
      html: "<p>Hello from Poe</p>",
      model: "Claude-Sonnet-4.5",
      strategyInfo: null,
    });

    expect(onUserMessage).toHaveBeenCalledWith({
      id: "m-1",
      text: "Hello Poe",
    });

    expect(onAssistantMessage).toHaveBeenCalledWith({
      id: "assistant-1",
      text: "Hello from Poe",
    });

    const calls = webview.posts.filter(
      (payload: any) => payload?.type === "thinking"
    );
    expect(calls[calls.length - 1]).toEqual({ type: "thinking", value: false });
  });

  it("clears history when instructed", async () => {
    const webview = createStubWebview();
    const chatService = createStubChatService();
    const onClearHistory = vi.fn();
    const controller = createWebviewController({
      chatService,
      webview: webview.api,
      renderMarkdown: (text: string) => `<p>${text}</p>`,
      availableTools: [],
      onClearHistory,
    });

    await controller.handleWebviewMessage({ type: "clearHistory" });

    expect(chatService.clearHistory).toHaveBeenCalledTimes(1);
    expect(webview.api.postMessage).toHaveBeenCalledWith({
      type: "historyCleared",
    });
    expect(onClearHistory).toHaveBeenCalledTimes(1);
  });
});
