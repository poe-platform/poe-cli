export interface ChatService {
  getModel(): string;
  sendMessage(
    text: string,
    tools: unknown[],
    options?: { signal?: AbortSignal; onChunk?: (chunk: string) => void }
  ): Promise<any>;
  clearHistory(): void;
  isStrategyEnabled(): boolean;
  getStrategyInfo(): string;
  setStrategy?(config: unknown): void;
  enableStrategy?(): void;
  disableStrategy?(): void;
  setModel?(model: string): void;
}

export interface WebviewLike {
  postMessage(message: unknown): Thenable<boolean> | boolean;
}

interface UiAdapter {
  info(message: string): void;
  error(message: string): void;
}

interface CreateWebviewControllerOptions {
  chatService: ChatService;
  webview: WebviewLike;
  renderMarkdown: (markdown: string) => string;
  availableTools: unknown[];
  handleTasksCommand?: (args: string[]) => Promise<string>;
  openSettings?: () => Promise<void> | void;
  ui?: UiAdapter;
  onUserMessage?: (details: { id: string; text: string }) => void;
  onAssistantMessage?: (details: { id: string; text: string }) => void;
  onClearHistory?: () => void;
  onRespondingChange?: (active: boolean) => void;
}

export interface WebviewController {
  handleWebviewMessage(message: unknown): Promise<void>;
  post(message: unknown): void;
  setAvailableTools(tools: unknown[]): void;
}

export function createWebviewController(
  options: CreateWebviewControllerOptions
): WebviewController {
  let tools = [...options.availableTools];
  let activeAbortController: AbortController | null = null;

  function post(message: unknown): void {
    options.webview.postMessage(message);
  }

  function strategySnapshot() {
    return {
      type: "strategyStatus",
      enabled: options.chatService.isStrategyEnabled(),
      info: options.chatService.isStrategyEnabled()
        ? options.chatService.getStrategyInfo()
        : "Strategy disabled",
      currentModel: options.chatService.getModel(),
    };
  }

  function splitArguments(input: string): string[] {
    const trimmed = input.trimStart();
    if (trimmed.length === 0) {
      return [];
    }
    const result: string[] = [];
    let current = "";
    let quote: string | null = null;
    for (const char of trimmed) {
      if (quote) {
        if (char === quote) {
          quote = null;
        } else {
          current += char;
        }
        continue;
      }
      if (char === "'" || char === '"') {
        quote = char;
        continue;
      }
      if (char === " " || char === "\t") {
        if (current.length > 0) {
          result.push(current);
          current = "";
        }
        continue;
      }
      current += char;
    }
    if (current.length > 0) {
      result.push(current);
    }
    if (quote && result.length > 0) {
      const lastIndex = result.length - 1;
      result[lastIndex] = `${result[lastIndex]}${quote}`;
    }
    return result;
  }

  async function handleSlashCommand(input: string): Promise<string | null> {
    if (!input.startsWith("/")) {
      return null;
    }
    if (input.startsWith("/tasks")) {
      const handler = options.handleTasksCommand;
      if (!handler) {
        return "Tasks command is unavailable in this context.";
      }
      const args = splitArguments(input.slice("/tasks".length));
      return handler(args);
    }
    return null;
  }

  async function handleSendMessage(payload: any): Promise<void> {
    if (!payload || typeof payload.text !== "string") {
      return;
    }
    const trimmed = payload.text.trim();
    if (!trimmed.length) {
      return;
    }

    const messageId =
      typeof payload.id === "string" && payload.id.length > 0
        ? payload.id
        : `m-${Date.now()}`;

    const abortController = new AbortController();
    activeAbortController = abortController;
    options.onRespondingChange?.(true);
    post({ type: "responding", value: true });
    post({ type: "thinking", value: true });
    post({
      type: "message",
      role: "user",
      id: messageId,
      html: options.renderMarkdown(trimmed),
      model: options.chatService.getModel(),
    });
    options.onUserMessage?.({ id: messageId, text: trimmed });

    try {
      const slashResult = await handleSlashCommand(trimmed);
      if (typeof slashResult === "string") {
        const responseId = `tasks-${Date.now()}`;
        post({
          type: "message",
          role: "assistant",
          id: responseId,
          html: options.renderMarkdown(slashResult),
          model: "Tasks",
          strategyInfo: null,
        });
        options.onAssistantMessage?.({ id: responseId, text: slashResult });
        return;
      }

      const rawResponse = await options.chatService.sendMessage(trimmed, tools, {
        signal: abortController.signal,
      });
      const responseId =
        (rawResponse && typeof rawResponse.id === "string" && rawResponse.id) ||
        `assistant-${Date.now()}`;
      const content =
        (rawResponse &&
          typeof rawResponse.content === "string" &&
          rawResponse.content) ||
        rawResponse?.choices?.[0]?.message?.content ||
        "No response from model";

      post({
        type: "message",
        role: "assistant",
        id: responseId,
        html: options.renderMarkdown(content),
        model: options.chatService.getModel(),
        strategyInfo: options.chatService.isStrategyEnabled()
          ? options.chatService.getStrategyInfo()
          : null,
      });
      options.onAssistantMessage?.({ id: responseId, text: content });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        post({ type: "responseStopped" });
        return;
      }
      const text =
        error instanceof Error ? error.message : String(error ?? "Unknown");
      post({
        type: "error",
        text,
      });
      options.ui?.error(text);
    } finally {
      activeAbortController = null;
      post({ type: "thinking", value: false });
      post({ type: "responding", value: false });
      options.onRespondingChange?.(false);
    }
  }

  async function handleClearHistory(): Promise<void> {
    options.chatService.clearHistory();
    post({ type: "historyCleared" });
    options.onClearHistory?.();
  }

  async function handleStopResponse(): Promise<void> {
    const controller = activeAbortController;
    if (!controller || controller.signal.aborted) {
      return;
    }
    controller.abort();
  }

  async function handleGetStrategy(): Promise<void> {
    post(strategySnapshot());
  }

  async function handleSetStrategy(payload: any): Promise<void> {
    if (!options.chatService.setStrategy) {
      return;
    }
    try {
      options.chatService.setStrategy(payload?.config);
      post(strategySnapshot());
      options.ui?.info("Strategy updated successfully!");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error ?? "Unknown");
      options.ui?.error(`Failed to set strategy: ${message}`);
    }
  }

  async function handleToggleStrategy(payload: any): Promise<void> {
    const enabled = Boolean(payload?.enabled);
    if (enabled) {
      options.chatService.enableStrategy?.();
    } else {
      options.chatService.disableStrategy?.();
    }
    post(strategySnapshot());
  }

  async function handleSetModel(payload: any): Promise<void> {
    if (!options.chatService.setModel) {
      return;
    }
    const model =
      typeof payload?.model === "string" ? payload.model.trim() : "";
    if (!model.length) {
      return;
    }
    options.chatService.setModel(model);
    post({
      type: "modelChanged",
      model: options.chatService.getModel(),
    });
  }

  async function handleOpenSettings(): Promise<void> {
    await options.openSettings?.();
  }

  async function handleInfo(payload: any): Promise<void> {
    const text = typeof payload?.text === "string" ? payload.text : "";
    if (text.length === 0) {
      return;
    }
    options.ui?.info(text);
  }

  async function handleError(payload: any): Promise<void> {
    const text = typeof payload?.text === "string" ? payload.text : "";
    if (text.length === 0) {
      return;
    }
    options.ui?.error(text);
  }

  async function handleWebviewMessage(message: unknown): Promise<void> {
    const payload = message ?? {};
    const type = typeof (payload as any).type === "string" ? (payload as any).type : "";
    switch (type) {
      case "sendMessage":
        await handleSendMessage(payload);
        break;
      case "clearHistory":
        await handleClearHistory();
        break;
      case "stopResponse":
        await handleStopResponse();
        break;
      case "getStrategyStatus":
        await handleGetStrategy();
        break;
      case "setStrategy":
        await handleSetStrategy(payload);
        break;
      case "toggleStrategy":
        await handleToggleStrategy(payload);
        break;
      case "setModel":
        await handleSetModel(payload);
        break;
      case "openSettings":
        await handleOpenSettings();
        break;
      case "info":
        await handleInfo(payload);
        break;
      case "error":
        await handleError(payload);
        break;
      default:
        break;
    }
  }

  return {
    handleWebviewMessage,
    post,
    setAvailableTools(nextTools: unknown[]) {
      tools = [...nextTools];
    },
  };
}
