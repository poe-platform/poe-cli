import { claudeCodeAdapter } from "./claude-code.js";
import { codexAdapter } from "./codex.js";
import { openCodeAdapter } from "./opencode.js";
import { rooCodeAdapter } from "./roo-code.js";
import type { ProviderAdapter } from "../cli/service-registry.js";

export function getDefaultProviders(): ProviderAdapter[] {
  return [
    claudeCodeAdapter as unknown as ProviderAdapter,
    codexAdapter as unknown as ProviderAdapter,
    openCodeAdapter as unknown as ProviderAdapter,
    rooCodeAdapter as unknown as ProviderAdapter
  ];
}
