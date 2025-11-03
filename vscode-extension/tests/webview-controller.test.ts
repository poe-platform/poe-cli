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
  const signals: AbortSignal[] = [];
  const sendMessage = vi.fn(
    async (
      _text: string,
      _tools: unknown[],
      options?: { signal?: AbortSignal }
    ) => {
      if (options?.signal) {
        signals.push(options.signal);
      }
      return {
        id: "assistant-1",
        content: "Hello from Poe",
      };
    }
  );

  return {
    getModel: vi.fn(() => "Claude-Sonnet-4.5"),
    clearHistory: vi.fn(),
    sendMessage,
    isStrategyEnabled: vi.fn(() => false),
    getStrategyInfo: vi.fn(() => "Strategy disabled"),
    setStrategy: vi.fn(),
    signals,
  };
}

describe("createWebviewController", () => {
  it("routes user messages through the chat service and echoes responses", async () => {
    const webview = createStubWebview();
    const chatService = createStubChatService();
    const onUserMessage = vi.fn();
    const onAssistantMessage = vi.fn();
    const onRespondingChange = vi.fn();

    const controller = createWebviewController({
      chatService,
      webview: webview.api,
      renderMarkdown: (text: string) => `<p>${text}</p>`,
      availableTools: [{ name: "noop" }],
      onUserMessage,
      onAssistantMessage,
      onRespondingChange,
    });

    await controller.handleWebviewMessage({
      type: "sendMessage",
      id: "m-1",
      text: "Hello Poe",
    });

    expect(chatService.sendMessage).toHaveBeenCalledWith(
      "Hello Poe",
      [{ name: "noop" }],
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
    expect(chatService.signals[0]?.aborted).toBe(false);

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

    const responding = webview.posts.filter(
      (payload: any) => payload?.type === "responding"
    );
    expect(responding[0]).toEqual({ type: "responding", value: true });
    expect(responding[responding.length - 1]).toEqual({
      type: "responding",
      value: false,
    });
    expect(onRespondingChange).toHaveBeenCalledWith(true);
    expect(onRespondingChange).toHaveBeenCalledWith(false);
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

  it("aborts the active response when stop is requested", async () => {
    const webview = createStubWebview();
    let aborted = false;
    const chatService = {
      getModel: vi.fn(() => "Claude-Sonnet-4.5"),
      clearHistory: vi.fn(),
      sendMessage: vi.fn(
        (_text: string, _tools: unknown[], options?: { signal?: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            options?.signal?.addEventListener("abort", () => {
              aborted = true;
              const error = new Error("Aborted");
              error.name = "AbortError";
              reject(error);
            });
          })
      ),
      isStrategyEnabled: vi.fn(() => false),
      getStrategyInfo: vi.fn(() => "Strategy disabled"),
      setStrategy: vi.fn(),
    };
    const onRespondingChange = vi.fn();
    const controller = createWebviewController({
      chatService: chatService as any,
      webview: webview.api,
      renderMarkdown: (text: string) => `<p>${text}</p>`,
      availableTools: [],
      onRespondingChange,
    });

    const pending = controller.handleWebviewMessage({
      type: "sendMessage",
      id: "m-2",
      text: "Working...",
    });

    await Promise.resolve();

    await controller.handleWebviewMessage({ type: "stopResponse" });

    expect(aborted).toBe(true);
    await expect(pending).resolves.toBeUndefined();

    const responding = webview.posts.filter(
      (payload: any) => payload?.type === "responding"
    );
    expect(responding[responding.length - 1]).toEqual({
      type: "responding",
      value: false,
    });
    expect(onRespondingChange).toHaveBeenCalledWith(false);
    expect(webview.api.postMessage).toHaveBeenCalledWith({
      type: "responseStopped",
    });
  });
});
