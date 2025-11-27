import { claudeCodeService } from "./claude-code.js";
import { codexService } from "./codex.js";
import { openCodeService } from "./opencode.js";
import { rooCodeService } from "./roo-code.js";
import type { ProviderService } from "../cli/service-registry.js";

export function getDefaultProviders(): ProviderService[] {
  return [claudeCodeService, codexService, openCodeService, rooCodeService];
}
