import type { ProviderSetting } from "../config/provider-settings.js";
import { PoeSettingsPanel, registerPoeSettingsPanel } from "./components/settings-panel.js";
import type { StrategyKind } from "./components/settings-panel.js";

interface InitializeOptions {
  document: Document;
  appShellHtml: string;
  providerSettings: ProviderSetting[];
  modelOptions: string[];
  defaultModel: string;
  logoUrl: string;
  postMessage: (message: unknown) => void;
}

interface ToolNotification {
  element: HTMLElement;
  timeoutId: number;
}

export interface WebviewApp {
  handleMessage(message: any): void;
}

export function initializeWebviewApp(options: InitializeOptions): WebviewApp {
  const doc = options.document;
  const view = doc.defaultView ?? (globalThis as typeof globalThis & Window);
  const hostRegistry = view?.customElements ?? null;
  const globalRegistry = (globalThis as typeof globalThis & {
    customElements?: CustomElementRegistry;
  }).customElements;
  registerPoeSettingsPanel(globalRegistry ?? null);
  registerPoeSettingsPanel(hostRegistry ?? null);

  const settingsPanelElement = doc.getElementById("settings-panel");
  if (settingsPanelElement && hostRegistry?.get("poe-settings-panel")) {
    try {
      hostRegistry.upgrade(settingsPanelElement);
    } catch {
      // Ignore upgrade errors in non-browser environments.
    }
  }
  const appShellHost = doc.querySelector<HTMLElement>("[data-slot='app-shell']");
  const chatContainer = doc.getElementById("chat-container") as
    | HTMLElement
    | null;
  const messagesDiv = doc.getElementById("messages") as HTMLElement | null;
  const messageInput = doc.getElementById("message-input") as
    | HTMLTextAreaElement
    | null;
  const sendButton = doc.getElementById("send-button") as HTMLButtonElement | null;
  const clearButton = doc.getElementById("clear-button") as HTMLButtonElement | null;
  const thinkingIndicator = doc.getElementById("thinking-indicator") as
    | HTMLElement
    | null;
  const toolNotifications = doc.getElementById("tool-notifications") as
    | HTMLElement
    | null;
  const composer = doc.querySelector(".composer") as HTMLElement | null;
  const settingsPanel = doc.getElementById("settings-panel") as PoeSettingsPanel | null;
  const chatHistory = doc.getElementById("chat-history") as HTMLElement | null;
  const chatHistoryContent = chatHistory?.querySelector(
    ".chat-history-content"
  ) as HTMLElement | null;
  const historyCloseButton = chatHistory?.querySelector(
    "[data-action='history-close']"
  ) as HTMLButtonElement | null;

  if (appShellHost) {
    appShellHost.innerHTML = options.appShellHtml;
  }

  const welcomeSnapshot =
    messagesDiv?.innerHTML ??
    '<div class="welcome-message"><div class="welcome-hero"><h2>Welcome to Poe Code</h2><p>Configure strategies and models to tailor your chat workflow.</p></div><div class="welcome-grid"><article class="welcome-card" data-feature="strategies"><h3>Adaptive orchestration</h3><p>Enable smart, mixed, or fixed model flows.</p></article></div></div>';

  const notifications: ToolNotification[] = [];
  const chatHistoryStore: Array<{id: string; title: string; preview: string; messages: any[]}> = [];
  const pendingToolMessages = new Map<string, HTMLElement[]>();
  let activeModel = options.defaultModel;
  let settingsVisible = false;
  let historyVisible = false;

  function setActiveModel(model: string): void {
    if (!model.length) {
      return;
    }
    activeModel = model;
    if (settingsPanel) {
      settingsPanel.activeModel = model;
    }
  }

  function publishModel(value: string): void {
    const trimmed = value.trim();
    if (!trimmed.length) {
      return;
    }
    setActiveModel(trimmed);
    options.postMessage({ type: "setModel", model: trimmed });
  }

  function openSettingsPanel(): void {
    if (settingsPanel) {
      settingsPanel.providers = options.providerSettings;
      settingsPanel.models = options.modelOptions;
      settingsPanel.open = true;
    }
    settingsVisible = true;
    options.postMessage({ type: "getStrategyStatus" });
  }

  function hideSettingsPanel(): void {
    if (settingsPanel) {
      settingsPanel.open = false;
    }
    settingsVisible = false;
  }

  if (sendButton) {
    sendButton.addEventListener("click", () => sendMessage());
  }

  if (messageInput) {
    messageInput.addEventListener("keydown", (event) => {
      const keyboardEvent = event as KeyboardEvent;
      if (keyboardEvent.key === "Enter" && !keyboardEvent.shiftKey) {
        keyboardEvent.preventDefault();
        sendMessage();
      }
    });
    messageInput.addEventListener("input", () => adjustInputHeight());
  }

  function adjustInputHeight(): void {
    if (!messageInput) {
      return;
    }
    messageInput.style.height = "auto";
    const maxHeight = 220;
    const measured = messageInput.scrollHeight;
    const target = Math.min(maxHeight, measured);
    messageInput.style.height = `${target}px`;
  }

  function sendMessage(): void {
    if (!messageInput) {
      return;
    }
    const text = messageInput.value.trim();
    if (!text.length) {
      return;
    }
    options.postMessage({
      type: "sendMessage",
      id: `m-${Date.now()}`,
      text
    });
    messageInput.value = "";
    adjustInputHeight();
  }

  if (clearButton) {
    clearButton.addEventListener("click", () => {
      options.postMessage({ type: "clearHistory" });
      hideChatHistory();
    });
  }

  if (appShellHost) {
    appShellHost.addEventListener("click", (event) => {
      const target = (event.target as HTMLElement | null)?.closest<HTMLElement>(
        "[data-action]"
      );
      if (!target) {
        return;
      }
      const action = target.getAttribute("data-action");
      if (action === "new-chat") {
        event.preventDefault();
        saveCurrentChatToHistory();
        options.postMessage({ type: "clearHistory" });
        hideChatHistory();
      } else if (action === "open-settings") {
        event.preventDefault();
        toggleSettingsPanel();
      } else if (action === "chat-history") {
        event.preventDefault();
        toggleChatHistory();
      }
    });
  }

  if (settingsPanel) {
    settingsPanel.providers = options.providerSettings;
    settingsPanel.models = options.modelOptions;
    settingsPanel.activeModel = activeModel;

    settingsPanel.addEventListener("settings-close", () => {
      hideSettingsPanel();
    });

    settingsPanel.addEventListener("model-change", (event) => {
      const detail = (event as CustomEvent<{ model?: string }>).detail;
      if (detail?.model) {
        publishModel(detail.model);
      }
    });

    settingsPanel.addEventListener("strategy-toggle", (event) => {
      const detail = (event as CustomEvent<{ enabled?: boolean }>).detail;
      options.postMessage({
        type: "toggleStrategy",
        enabled: Boolean(detail?.enabled),
      });
    });

    settingsPanel.addEventListener("strategy-change", (event) => {
      const detail = (event as CustomEvent<{ config?: unknown }>).detail;
      if (detail?.config) {
        options.postMessage({ type: "setStrategy", config: detail.config });
      }
    });

    settingsPanel.addEventListener("open-mcp", () => {
      options.postMessage({ type: "openSettings" });
      hideSettingsPanel();
    });
  }

  if (historyCloseButton) {
    historyCloseButton.addEventListener("click", () => {
      hideChatHistory();
    });
  }

  function toggleThinking(active: boolean): void {
    if (!thinkingIndicator) {
      return;
    }
    if (active) {
      thinkingIndicator.classList.remove("hidden");
    } else {
      thinkingIndicator.classList.add("hidden");
    }
  }

  function renderAvatar(role: "user" | "assistant"): HTMLElement {
    const avatar = doc.createElement("div");
    avatar.className = `avatar ${role}`;
    if (role === "assistant") {
      const img = doc.createElement("img");
      img.src = options.logoUrl;
      img.alt = "Poe";
      avatar.appendChild(img);
    } else {
      avatar.textContent = "U";
    }
    return avatar;
  }

  function addMessageHtml(
    html: string,
    role: "user" | "assistant",
    model?: string
  ): void {
    if (!messagesDiv) {
      return;
    }
    const welcome = messagesDiv.querySelector(".welcome-message");
    if (welcome) {
      welcome.remove();
    }

    const wrapper = doc.createElement("div");
    wrapper.className = `message-wrapper ${role}`;
    wrapper.setAttribute("data-test", role === "assistant" ? "message-wrapper-assistant" : "message-wrapper-user");

    const header = doc.createElement("div");
    header.className = "message-header";
    header.appendChild(renderAvatar(role));

    const label = doc.createElement("span");
    label.textContent = role === "assistant" ? "Poe Assistant" : "You";
    header.appendChild(label);

    if (model && role === "assistant") {
      const modelTag = doc.createElement("strong");
      modelTag.className = "message-model";
      modelTag.textContent = model;
      header.appendChild(modelTag);
    }

    const content = doc.createElement("div");
    content.className = "message-content";
    content.innerHTML = html;

    wrapper.appendChild(header);
    wrapper.appendChild(content);
    messagesDiv.appendChild(wrapper);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  }

  function addDiffPreview(html: string): void {
    if (!messagesDiv) {
      return;
    }
    const container = doc.createElement("div");
    container.className = "message-wrapper diff";
    container.setAttribute("data-test", "message-wrapper-diff");
    const content = doc.createElement("div");
    content.className = "message-content";
    content.innerHTML = html;
    container.appendChild(content);
    messagesDiv.appendChild(container);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  }

  function addError(text: string): void {
    if (!messagesDiv) {
      return;
    }
    const wrapper = doc.createElement("div");
    wrapper.className = "message-wrapper error";
    const content = doc.createElement("div");
    content.className = "message-content";
    content.textContent = text;
    wrapper.appendChild(content);
    messagesDiv.appendChild(wrapper);
  }

  function rememberToolMessage(toolName: string, element: HTMLElement): void {
    const existing = pendingToolMessages.get(toolName);
    if (existing) {
      existing.push(element);
    } else {
      pendingToolMessages.set(toolName, [element]);
    }
  }

  function consumeToolMessage(toolName: string): HTMLElement | undefined {
    const queue = pendingToolMessages.get(toolName);
    if (!queue || queue.length === 0) {
      return undefined;
    }
    const [current, ...remaining] = queue;
    if (remaining.length > 0) {
      pendingToolMessages.set(toolName, remaining);
    } else {
      pendingToolMessages.delete(toolName);
    }
    return current;
  }

  function addToolMessage(details: { toolName: string; args?: unknown }): void {
    if (!messagesDiv) {
      return;
    }
    const welcome = messagesDiv.querySelector(".welcome-message");
    if (welcome) {
      welcome.remove();
    }
    const wrapper = doc.createElement("div");
    wrapper.className = "message-wrapper tool running";
    wrapper.dataset.toolName = details.toolName;

    const header = doc.createElement("div");
    header.className = "message-header";

    const icon = doc.createElement("span");
    icon.className = "tool-icon";
    icon.textContent = "🔧";
    header.appendChild(icon);

    const title = doc.createElement("span");
    title.className = "tool-title";
    title.textContent = `Tool · ${details.toolName}`;
    header.appendChild(title);

    wrapper.appendChild(header);

    const content = doc.createElement("div");
    content.className = "message-content";

    const statusLine = doc.createElement("div");
    statusLine.className = "message-tool-status";
    statusLine.textContent = "Running tool…";
    content.appendChild(statusLine);

    if (details.args && typeof details.args === "object") {
      try {
        const formatted = JSON.stringify(details.args, null, 2);
        if (formatted) {
          const argsBlock = doc.createElement("pre");
          argsBlock.className = "message-tool-args";
          argsBlock.textContent = formatted;
          content.appendChild(argsBlock);
        }
      } catch {
        // Ignore serialization failures.
      }
    }

    wrapper.appendChild(content);
    messagesDiv.appendChild(wrapper);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
    rememberToolMessage(details.toolName, wrapper);
  }

  function completeToolMessage(details: {
    toolName: string;
    success: boolean;
    error?: string;
  }): void {
    const entry = consumeToolMessage(details.toolName);
    if (!entry) {
      return;
    }
    entry.classList.remove("running");
    entry.classList.add(details.success ? "success" : "error");

    const statusLine = entry.querySelector<HTMLElement>(".message-tool-status");
    if (statusLine) {
      if (details.success) {
        statusLine.textContent = "✓ Tool completed successfully.";
      } else if (details.error && details.error.length > 0) {
        statusLine.textContent = `✗ Tool failed: ${details.error}`;
      } else {
        statusLine.textContent = "✗ Tool failed.";
      }
    }

    if (!details.success && details.error && details.error.length > 0) {
      const errorLine = doc.createElement("div");
      errorLine.className = "message-tool-error";
      errorLine.textContent = details.error;
      entry.querySelector(".message-content")?.appendChild(errorLine);
    }

    if (messagesDiv) {
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }
  }

  function updateStrategyBadge(info: string | null, enabled: boolean): void {
    if (!settingsPanel) {
      return;
    }
    settingsPanel.strategyEnabled = enabled;
    if (!enabled || !info || info === "Strategy disabled") {
      settingsPanel.strategyInfo = "";
      settingsPanel.strategyType = "fixed";
      return;
    }
    settingsPanel.strategyInfo = info;
    settingsPanel.strategyType = deriveStrategyType(info);
  }

  function deriveStrategyType(info: string): StrategyKind {
    const normalized = info.toLowerCase();
    if (normalized.includes("smart")) {
      return "smart";
    }
    if (normalized.includes("mixed")) {
      return "mixed";
    }
    if (normalized.includes("round-robin")) {
      return "round-robin";
    }
    return "fixed";
  }

  function showToolNotification(text: string, variant: "running" | "success" | "error"): void {
    if (!toolNotifications) {
      return;
    }
    const item = doc.createElement("div");
    item.className = `tool-notification ${variant}`;
    item.textContent = text;
    toolNotifications.appendChild(item);
    const timeoutId = view.setTimeout(() => {
      item.classList.add("fade");
      const removal = view.setTimeout(() => item.remove(), 400);
      notifications.push({ element: item, timeoutId: removal });
    }, 2500);
    notifications.push({ element: item, timeoutId });
  }

  function resetHistory(): void {
    if (messagesDiv) {
      messagesDiv.innerHTML = welcomeSnapshot;
    }
    if (messageInput) {
      messageInput.value = "";
    }
    pendingToolMessages.clear();
    hideChatHistory();
  }

  function saveCurrentChatToHistory(): void {
    if (!messagesDiv) {
      return;
    }
    const messages = Array.from(messagesDiv.querySelectorAll(".message-wrapper"));
    if (messages.length === 0 || messages.some(m => m.classList.contains("welcome-message"))) {
      return;
    }

    const firstMessage = messages[0]?.querySelector(".message-content")?.textContent ?? "";
    const title = firstMessage.substring(0, 50) + (firstMessage.length > 50 ? "..." : "");
    const preview = firstMessage.substring(0, 100) + (firstMessage.length > 100 ? "..." : "");

    chatHistoryStore.push({
      id: `chat-${Date.now()}`,
      title: title || "New Chat",
      preview: preview || "Empty chat",
      messages: Array.from(messages).map(m => m.outerHTML)
    });
  }

  function toggleChatHistory(): void {
    if (historyVisible) {
      hideChatHistory();
    } else {
      showChatHistory();
    }
  }

  function showChatHistory(): void {
    historyVisible = true;
    if (chatContainer) {
      chatContainer.classList.add("hidden");
    }
    if (composer) {
      composer.classList.add("hidden");
    }
    if (chatHistory) {
      chatHistory.classList.remove("hidden");
    }
    renderChatHistory();
  }

  function hideChatHistory(): void {
    historyVisible = false;
    if (chatContainer) {
      chatContainer.classList.remove("hidden");
    }
    if (composer) {
      composer.classList.remove("hidden");
    }
    if (chatHistory) {
      chatHistory.classList.add("hidden");
    }
  }

  function renderChatHistory(): void {
    if (!chatHistoryContent) {
      return;
    }

    if (chatHistoryStore.length === 0) {
      chatHistoryContent.innerHTML = '<div class="chat-history-empty">No chat history available yet.</div>';
      return;
    }

    chatHistoryContent.innerHTML = "";
    for (const chat of chatHistoryStore.slice().reverse()) {
      const item = doc.createElement("div");
      item.className = "chat-history-item";
      item.dataset.chatId = chat.id;

      const title = doc.createElement("div");
      title.className = "chat-history-item-title";
      title.textContent = chat.title;

      const preview = doc.createElement("div");
      preview.className = "chat-history-item-preview";
      preview.textContent = chat.preview;

      item.appendChild(title);
      item.appendChild(preview);

      item.addEventListener("click", () => {
        loadChatFromHistory(chat.id);
      });

      chatHistoryContent.appendChild(item);
    }
  }

  function loadChatFromHistory(chatId: string): void {
    const chat = chatHistoryStore.find(c => c.id === chatId);
    if (!chat || !messagesDiv) {
      return;
    }

    messagesDiv.innerHTML = chat.messages.join("");
    hideChatHistory();
  }

  function toggleSettingsPanel(): void {
    if (settingsVisible) {
      hideSettingsPanel();
    } else {
      showSettingsPanel();
    }
  }

  function showSettingsPanel(): void {
    settingsVisible = true;
    openSettingsPanel();
  }

  setActiveModel(options.defaultModel);

  return {
    handleMessage(rawMessage: any) {
      const message = rawMessage ?? {};
      const type = typeof message.type === "string" ? message.type : "";
      switch (type) {
        case "thinking": {
          toggleThinking(Boolean(message.value));
          break;
        }
        case "message": {
          toggleThinking(false);
          const role = message.role === "assistant" ? "assistant" : "user";
          const html = typeof message.html === "string" ? message.html : "";
          addMessageHtml(html, role, message.model);
          if (typeof message.model === "string") {
            setActiveModel(message.model);
          }
          if (message.strategyInfo) {
            updateStrategyBadge(String(message.strategyInfo), true);
          }
          break;
        }
        case "historyCleared": {
          resetHistory();
          break;
        }
        case "diffPreview": {
          const html = typeof message.html === "string" ? message.html : "";
          if (html.length > 0) {
            addDiffPreview(html);
          }
          break;
        }
        case "modelChanged": {
          if (typeof message.model === "string") {
            setActiveModel(message.model);
          }
          break;
        }
        case "strategyStatus": {
          const enabled = Boolean(message.enabled);
          updateStrategyBadge(
            typeof message.info === "string" ? message.info : null,
            enabled
          );
          if (typeof message.currentModel === "string") {
            setActiveModel(message.currentModel);
          }
          break;
        }
        case "toolStarting": {
          if (typeof message.toolName === "string") {
            addToolMessage({
              toolName: message.toolName,
              args: message.args
            });
            showToolNotification(`🔧 ${message.toolName}`, "running");
          }
          break;
        }
        case "toolExecuted": {
          if (typeof message.toolName === "string") {
            completeToolMessage({
              toolName: message.toolName,
              success: Boolean(message.success),
              error:
                typeof message.error === "string" && message.error.length > 0
                  ? message.error
                  : undefined
            });
            if (message.success) {
              showToolNotification(`✓ ${message.toolName} completed`, "success");
            } else {
              showToolNotification(`✗ ${message.toolName} failed`, "error");
            }
          }
          break;
        }
        case "error": {
          toggleThinking(false);
          addError(String(message.text ?? "Unknown error"));
          break;
        }
      }
    }
  };
}
