interface AppShellOptions {
  logoUrl: string;
  models: string[];
  activeModel: string;
}

export function renderAppShell(options: AppShellOptions): string {
  return `
    <header class="flex w-full items-center justify-between border-b border-border bg-surface-raised px-5 py-3" data-test="app-header">
      <div class="flex items-center gap-2.5">
        <img src="${options.logoUrl}" alt="Poe Code" class="h-7 w-7 rounded-lg shadow-sm" data-test="brand-logo" />
        <span class="text-sm font-semibold text-text" data-test="brand-title">Poe Code</span>
      </div>
      <nav class="flex items-center gap-2" aria-label="Primary navigation">
        <button
          data-action="new-chat"
          data-test="new-chat-button"
          class="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium text-text-muted transition hover:bg-surface hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          type="button"
          aria-label="Start new chat"
        >
          <span>New message</span>
        </button>
        <button
          data-action="chat-history"
          data-test="chat-history-button"
          class="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium text-text-muted transition hover:bg-surface hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          type="button"
          aria-label="Open chat history"
        >
          <span>History</span>
        </button>
        <button
          data-action="open-settings"
          data-test="settings-button"
          class="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium text-text-muted transition hover:bg-surface hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          type="button"
          aria-label="Open settings"
        >
          <span>Settings</span>
        </button>
      </nav>
    </header>
  `;
}
