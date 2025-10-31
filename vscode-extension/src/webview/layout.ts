interface AppShellOptions {
  logoUrl: string;
  models: string[];
  activeModel: string;
}

export function renderAppShell(options: AppShellOptions): string {
  return `
    <nav class="flex h-full w-full flex-col items-center gap-6 border-r border-border bg-surface-raised py-6" data-test="app-navigation" aria-label="Main navigation">
      <div class="flex h-12 w-12 items-center justify-center rounded-xl bg-surface shadow-sm">
        <img src="${options.logoUrl}" alt="Poe Code" class="h-8 w-8 rounded-lg" data-test="brand-logo" />
      </div>
      <div class="flex flex-1 flex-col items-center gap-3">
        <button
          data-action="new-chat"
          data-test="new-chat-button"
          class="group flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-accent-fg shadow-md transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          type="button"
          aria-label="Start new chat"
        >
          <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15" />
            <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12h15" />
          </svg>
        </button>
        <button
          data-action="chat-history"
          data-test="chat-history-button"
          class="group flex h-11 w-11 items-center justify-center rounded-xl text-text-muted transition hover:bg-surface hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          type="button"
          aria-label="Open chat history"
        >
          <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5" />
            <path stroke-linecap="round" stroke-linejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </button>
        <button
          data-action="open-settings"
          data-test="settings-button"
          class="group flex h-11 w-11 items-center justify-center rounded-xl text-text-muted transition hover:bg-surface hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          type="button"
          aria-label="Open settings"
        >
          <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M10.34 6.34c.43-1.77 2.89-1.77 3.32 0a1.5 1.5 0 002.12.99c1.62-.77 3.25.85 2.48 2.48a1.5 1.5 0 00.99 2.12c1.77.43 1.77 2.89 0 3.32a1.5 1.5 0 00-.99 2.12c.77 1.62-.85 3.25-2.48 2.48a1.5 1.5 0 00-2.12.99c-.43 1.77-2.89 1.77-3.32 0a1.5 1.5 0 00-2.12-.99c-1.62.77-3.25-.85-2.48-2.48a1.5 1.5 0 00-.99-2.12c-1.77-.43-1.77-2.89 0-3.32a1.5 1.5 0 00.99-2.12c-.77-1.62.85-3.25 2.48-2.48a1.5 1.5 0 002.12-.99z" />
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      </div>
    </nav>
  `;
}
