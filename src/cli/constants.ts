export const FRONTIER_MODELS = [
  "Claude-Sonnet-4.5",
  "GPT-5.1-Codex"
] as const;

export const DEFAULT_FRONTIER_MODEL = "Claude-Sonnet-4.5";

export const CLAUDE_CODE_VARIANTS = {
  haiku: "Claude-Haiku-4.5",
  sonnet: "Claude-Sonnet-4.5",
  opus: "Claude-Opus-4.1"
} as const;

export const DEFAULT_CLAUDE_CODE_MODEL = CLAUDE_CODE_VARIANTS.sonnet;

export const CODEX_MODELS = ["gpt-5.1-codex"] as const;
export const DEFAULT_CODEX_MODEL = CODEX_MODELS[0];

export const DEFAULT_REASONING = "medium";
export const DEFAULT_QUERY_MODEL = DEFAULT_CLAUDE_CODE_MODEL;
export const PROVIDER_NAME = "poe";
