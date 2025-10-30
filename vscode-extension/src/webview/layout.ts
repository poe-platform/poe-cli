interface AppShellOptions {
  logoUrl: string;
  models: string[];
  activeModel: string;
}

export function renderAppShell({ logoUrl }: AppShellOptions): string {
  return `
    <header class="app-header">
      <div class="brand">
        <img src="${logoUrl}" alt="Poe Code" />
        <span>Poe Code</span>
      </div>
      <nav class="app-nav">
        <button data-action="open-history">Chat history</button>
        <button data-action="open-settings">Settings</button>
        <button data-action="new-message">New message</button>
      </nav>
    </header>
  `;
}
