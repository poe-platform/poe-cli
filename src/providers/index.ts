import { claudeCodeAdapter } from "./claude-code-adapter.js";
import { codexAdapter } from "./codex-adapter.js";
import { openCodeAdapter } from "./opencode-adapter.js";
import { rooCodeAdapter } from "./roo-code-adapter.js";
import type { ProviderAdapter } from "../cli/service-registry.js";

export function getDefaultProviders(): ProviderAdapter[] {
  return [
    claudeCodeAdapter as unknown as ProviderAdapter,
    codexAdapter as unknown as ProviderAdapter,
    openCodeAdapter as unknown as ProviderAdapter,
    rooCodeAdapter as unknown as ProviderAdapter
  ];
}
