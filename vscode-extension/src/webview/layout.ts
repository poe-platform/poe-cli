interface AppShellOptions {
  logoUrl: string;
  models: string[];
  activeModel: string;
}

export function renderAppShell(options: AppShellOptions): string {
  const modelItems = options.models
    .map(
      (model) =>
        `<li class="model-item${
          model === options.activeModel ? " active" : ""
        }">${model}</li>`
    )
    .join("");

  return `
    <header class="app-header">
      <div class="brand">
        <img src="${options.logoUrl}" alt="Poe Code" />
        <span>Poe Code</span>
      </div>
      <nav class="app-nav">
        <button data-action="new-chat">New Chat</button>
        <button data-action="open-settings">Settings</button>
        <button data-action="view-diffs">Diffs</button>
      </nav>
    </header>
    <aside class="sidebar">
      <h2>Models</h2>
      <ul class="model-list">
        ${modelItems}
      </ul>
    </aside>
  `;
}

