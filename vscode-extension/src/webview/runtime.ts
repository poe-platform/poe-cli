import type { ProviderSetting } from "../config/provider-settings.js";

interface InitializeOptions {
  document: Document;
  appShellHtml: string;
  modelSelectorHtml: string;
  providerSettings: ProviderSetting[];
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
  const appShellHost = doc.querySelector<HTMLElement>("[data-slot='app-shell']");
  const modelSelectorHost = doc.querySelector<HTMLElement>(
    "[data-slot='model-selector']"
  );
  const messagesDiv = doc.getElementById("messages") as HTMLElement | null;
  const messageInput = doc.getElementById("message-input") as
    | HTMLTextAreaElement
    | null;
  const sendButton = doc.getElementById("send-button") as HTMLButtonElement | null;
  const clearButton = doc.getElementById("clear-button") as HTMLButtonElement | null;
  const thinkingIndicator = doc.getElementById("thinking-indicator") as
    | HTMLElement
    | null;
  const modelBadge = doc.getElementById("model-badge") as HTMLElement | null;
  const strategyBadge = doc.getElementById("strategy-badge") as HTMLElement | null;
  const toolNotifications = doc.getElementById("tool-notifications") as
    | HTMLElement
    | null;
  const settingsPanel = doc.getElementById("settings-panel") as HTMLElement | null;
  const providerSettingsContainer = doc.getElementById(
    "provider-settings"
  ) as HTMLElement | null;
  const settingsCloseButton = settingsPanel?.querySelector(
    "[data-action='settings-close']"
  ) as HTMLButtonElement | null;
  const settingsOpenMcpButton = settingsPanel?.querySelector(
    "[data-action='settings-open-mcp']"
  ) as HTMLButtonElement | null;

  if (appShellHost) {
    appShellHost.innerHTML = options.appShellHtml;
  }
  if (modelSelectorHost) {
    modelSelectorHost.innerHTML = options.modelSelectorHtml;
  }

  const sidebarList = appShellHost?.querySelector(".model-list") as
    | HTMLElement
    | null;
  const modelInput = modelSelectorHost?.querySelector("input") as
    | HTMLInputElement
    | null;

  const welcomeSnapshot =
    messagesDiv?.innerHTML ??
    '<div class="welcome-message"><h2>Welcome to Poe Code</h2><p>Start chatting with Poe models or explore tooling via the sidebar.</p></div>';

  const notifications: ToolNotification[] = [];
  let activeModel = options.defaultModel;
  let settingsVisible = false;

  function setActiveModel(model: string): void {
    if (!model.length) {
      return;
    }
    activeModel = model;

    if (modelBadge) {
      modelBadge.textContent = model;
    }

    if (modelInput) {
      modelInput.value = model;
    }

    if (sidebarList) {
      let matched = false;
      const items = Array.from(sidebarList.querySelectorAll(".model-item"));
      for (const item of items) {
        const text = item.textContent ?? "";
        const isMatch = text.trim() === model;
        item.classList.toggle("active", isMatch);
        if (isMatch) {
          matched = true;
        }
      }
      if (!matched) {
        const newItem = doc.createElement("li");
        newItem.className = "model-item active";
        newItem.textContent = model;
        sidebarList.prepend(newItem);
        wireModelItem(newItem);
      }
    }
    highlightActiveProvider(model);
  }

  function wireModelItem(item: Element): void {
    item.addEventListener("click", () => {
      const text = item.textContent ?? "";
      const trimmed = text.trim();
      if (!trimmed.length) {
        return;
      }
      setActiveModel(trimmed);
      options.postMessage({ type: "setModel", model: trimmed });
    });
  }

  if (sidebarList) {
    const existingItems = Array.from(sidebarList.querySelectorAll(".model-item"));
    if (existingItems.length === 0 && options.providerSettings.length > 0) {
      for (const provider of options.providerSettings) {
        const element = doc.createElement("li");
        element.className =
          provider.label === options.defaultModel
            ? "model-item active"
            : "model-item";
        element.textContent = provider.label;
        sidebarList.appendChild(element);
      }
    }
    for (const item of Array.from(sidebarList.querySelectorAll(".model-item"))) {
      wireModelItem(item);
    }
  }

  if (modelInput) {
    modelInput.addEventListener("keydown", (event) => {
      const keyboardEvent = event as KeyboardEvent;
      if (keyboardEvent.key === "Enter" && !keyboardEvent.shiftKey) {
        keyboardEvent.preventDefault();
        publishModel(modelInput.value);
      }
    });
    modelInput.addEventListener("blur", () => publishModel(modelInput.value));
  }

  function publishModel(value: string): void {
    const trimmed = value.trim();
    if (!trimmed.length) {
      return;
    }
    setActiveModel(trimmed);
    options.postMessage({ type: "setModel", model: trimmed });
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
    });
  }

  const navButtons = appShellHost?.querySelectorAll("[data-action]") ?? [];
  navButtons.forEach((button) => {
    const action = button.getAttribute("data-action");
    if (action === "new-chat") {
      button.addEventListener("click", () => {
        options.postMessage({ type: "clearHistory" });
      });
    } else if (action === "open-settings") {
      button.addEventListener("click", () => {
        toggleSettingsPanel();
      });
    } else if (action === "view-diffs") {
      button.addEventListener("click", () => {
        focusLatestDiff();
      });
    }
  });

  if (settingsCloseButton) {
    settingsCloseButton.addEventListener("click", () => {
      hideSettingsPanel();
    });
  }

  if (settingsOpenMcpButton) {
    settingsOpenMcpButton.addEventListener("click", () => {
      options.postMessage({ type: "openSettings" });
      hideSettingsPanel();
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

  function updateStrategyBadge(info: string | null, enabled: boolean): void {
    if (!strategyBadge) {
      return;
    }
    if (!enabled || !info || info === "Strategy disabled") {
      strategyBadge.textContent = "No Strategy";
      strategyBadge.style.opacity = "0.6";
      return;
    }
    const mapping: Record<string, string> = {
      smart: "🧠 Smart",
      mixed: "🔄 Mixed",
      "round-robin": "🔁 Round Robin",
      fixed: "📌 Fixed"
    };
    const key = deriveStrategyType(info);
    strategyBadge.textContent = mapping[key] ?? info.split(":")[0] ?? info;
    strategyBadge.style.opacity = "1";
  }

  function deriveStrategyType(info: string): string {
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
  }

  function focusLatestDiff(): void {
    if (!messagesDiv) {
      return;
    }
    const diffs = messagesDiv.querySelectorAll(".message-wrapper.diff");
    if (diffs.length === 0) {
      return;
    }
    const lastDiff = diffs[diffs.length - 1] as HTMLElement;
    lastDiff.scrollIntoView({ behavior: "smooth", block: "start" });
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
    if (settingsPanel) {
      settingsPanel.classList.remove("hidden");
    }
    populateProviderSettings();
  }

  function hideSettingsPanel(): void {
    settingsVisible = false;
    if (settingsPanel) {
      settingsPanel.classList.add("hidden");
    }
  }

  function populateProviderSettings(): void {
    if (!providerSettingsContainer) {
      return;
    }
    providerSettingsContainer.innerHTML = "";

    if (options.providerSettings.length === 0) {
      const empty = doc.createElement("p");
      empty.className = "provider-empty";
      empty.textContent = "No provider configurations found.";
      providerSettingsContainer.appendChild(empty);
      return;
    }

    for (const provider of options.providerSettings) {
      const item = doc.createElement("div");
      item.className = "provider-item";
      item.dataset.providerLabel = provider.label;

      const label = doc.createElement("strong");
      label.textContent = provider.label;

      const detail = doc.createElement("span");
      detail.textContent = provider.id;

      item.appendChild(label);
      item.appendChild(detail);
      providerSettingsContainer.appendChild(item);
    }

    highlightActiveProvider(activeModel);
  }

  function highlightActiveProvider(model: string): void {
    if (!providerSettingsContainer) {
      return;
    }
    const items = providerSettingsContainer.querySelectorAll(".provider-item");
    const hostWindow = doc.defaultView;
    items.forEach((element) => {
      if (hostWindow && element instanceof hostWindow.HTMLElement) {
        const match = element.dataset.providerLabel === model;
        element.classList.toggle("active", match);
      }
    });
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
            showToolNotification(`🔧 ${message.toolName}`, "running");
          }
          break;
        }
        case "toolExecuted": {
          if (typeof message.toolName === "string") {
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
