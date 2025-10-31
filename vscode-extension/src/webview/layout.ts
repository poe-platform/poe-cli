interface AppShellOptions {
  logoUrl: string;
  models: string[];
  activeModel: string;
}

export function renderAppShell(options: AppShellOptions): string {
  return `
    <div class="flex items-center gap-2">
      <img src="${options.logoUrl}" alt="Poe Code" class="h-6 w-6 rounded-full" data-test="brand-logo" />
      <span class="text-sm font-semibold text-text" data-test="brand-title">Poe Code</span>
    </div>
    <nav class="flex items-center gap-2" aria-label="Chat actions">
      <button
        data-action="chat-history"
        data-test="chat-history-button"
        class="rounded-md border border-outline px-3 py-1 text-xs font-medium text-subtle transition hover:bg-surface-muted hover:text-text focus:outline-none focus:ring-2 focus:ring-accent"
        type="button"
      >
        Chat History
      </button>
      <button
        data-action="open-settings"
        data-test="settings-button"
        class="rounded-md border border-outline px-3 py-1 text-xs font-medium text-subtle transition hover:bg-surface-muted hover:text-text focus:outline-none focus:ring-2 focus:ring-accent"
        type="button"
      >
        Settings
      </button>
      <button
        data-action="new-chat"
        data-test="new-chat-button"
        class="rounded-md bg-button px-3 py-1 text-xs font-semibold text-button-foreground shadow focus:outline-none focus:ring-2 focus:ring-accent"
        type="button"
      >
        New Message
      </button>
    </nav>
  `;
}
