import { claudeCodeService } from "./claude-code.js";
import { codexService } from "./codex.js";
import { kimiService } from "./kimi.js";
import { openCodeService } from "./opencode.js";
import type { ProviderService } from "../cli/service-registry.js";

export function getDefaultProviders(): ProviderService[] {
  return [claudeCodeService, codexService, kimiService, openCodeService];
}
