interface AppShellOptions {
  logoUrl: string;
  models: string[];
  activeModel: string;
}

export function renderAppShell(options: AppShellOptions): string {
  return `
    <div class="brand">
      <img src="${options.logoUrl}" alt="Poe Code" />
      <span>Poe Code</span>
    </div>
    <nav class="app-nav">
      <button data-action="chat-history">Chat History</button>
      <button data-action="open-settings">Settings</button>
      <button data-action="new-chat">New Message</button>
    </nav>
  `;
}

