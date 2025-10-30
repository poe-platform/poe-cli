interface AppShellOptions {
  logoUrl: string;
  models: string[];
  activeModel: string;
}

export function renderAppShell(options: AppShellOptions): string {
  // Sidebar removed - using top header menu instead
  return "";
}

