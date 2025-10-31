interface AppShellOptions {
  logoUrl: string;
  models: string[];
  activeModel: string;
}

export function renderAppShell(options: AppShellOptions): string {
  return `
    <header class="flex w-full items-center justify-between border-b border-border/20 bg-surface-raised/80 px-5 py-3 backdrop-blur-sm" data-test="app-header">
      <div class="flex items-center gap-2.5">
        <img src="${options.logoUrl}" alt="Poe Code" class="h-7 w-7 rounded-lg shadow-sm" data-test="brand-logo" />
        <span class="text-sm font-semibold text-text" data-test="brand-title">Poe Code</span>
      </div>
      <nav class="flex items-center gap-1.5" aria-label="Chat actions">
        <button
          data-action="chat-history"
          data-test="chat-history-button"
          class="group relative rounded-xl p-2.5 text-text-muted transition duration-150 hover:bg-surface-raised hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
          type="button"
          aria-label="Open chat history"
        >
          <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5" />
            <path stroke-linecap="round" stroke-linejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span
            class="pointer-events-none absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-surface-raised px-2 py-1 text-xs text-text opacity-0 shadow-sm transition duration-150 group-hover:opacity-100"
            data-test="tooltip-chat-history"
          >
            History
          </span>
        </button>
        <button
          data-action="open-settings"
          data-test="settings-button"
          class="group relative rounded-xl p-2.5 text-text-muted transition duration-150 hover:bg-surface-raised hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
          type="button"
          aria-label="Open settings"
        >
          <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M10.34 6.34c.43-1.77 2.89-1.77 3.32 0a1.5 1.5 0 002.12.99c1.62-.77 3.25.85 2.48 2.48a1.5 1.5 0 00.99 2.12c1.77.43 1.77 2.89 0 3.32a1.5 1.5 0 00-.99 2.12c.77 1.62-.85 3.25-2.48 2.48a1.5 1.5 0 00-2.12.99c-.43 1.77-2.89 1.77-3.32 0a1.5 1.5 0 00-2.12-.99c-1.62.77-3.25-.85-2.48-2.48a1.5 1.5 0 00-.99-2.12c-1.77-.43-1.77-2.89 0-3.32a1.5 1.5 0 00.99-2.12c-.77-1.62.85-3.25 2.48-2.48a1.5 1.5 0 002.12-.99z" />
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span
            class="pointer-events-none absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-surface-raised px-2 py-1 text-xs text-text opacity-0 shadow-sm transition duration-150 group-hover:opacity-100"
            data-test="tooltip-settings"
          >
            Settings
          </span>
        </button>
        <button
          data-action="new-chat"
          data-test="new-chat-button"
          class="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-accent-fg shadow-md transition duration-150 hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
          type="button"
          aria-label="Start new chat"
        >
          <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15" />
            <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12h15" />
          </svg>
          <span class="hidden text-sm font-medium sm:inline">New chat</span>
        </button>
      </nav>
    </header>
  `;
}
