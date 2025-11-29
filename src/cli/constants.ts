export const FRONTIER_MODELS = [
  {
    id: "poe/Claude-Sonnet-4.5",
    providerId: "Claude-Sonnet-4.5",
    label: "Claude Sonnet 4.5"
  },
  {
    id: "poe/GPT-5.1-Contex",
    providerId: "GPT-5.1-Contex",
    label: "GPT-5.1 Contex"
  }
] as const;

export const DEFAULT_FRONTIER_MODEL = "poe/Claude-Sonnet-4.5";

export const CLAUDE_CODE_MODELS = [
  {
    id: "Claude-Haiku-4.5",
    label: "Claude Haiku 4.5",
    variant: "haiku"
  },
  {
    id: "Claude-Sonnet-4.5",
    label: "Claude Sonnet 4.5",
    variant: "sonnet"
  },
  {
    id: "Claude-Opus-4.1",
    label: "Claude Opus 4.1",
    variant: "opus"
  }
] as const;

export const DEFAULT_CLAUDE_CODE_MODEL = "Claude-Sonnet-4.5";
export const CLAUDE_MODEL_HAIKU = "Claude-Haiku-4.5";
export const CLAUDE_MODEL_SONNET = "Claude-Sonnet-4.5";
export const CLAUDE_MODEL_OPUS = "Claude-Opus-4.1";

export const CODEX_MODELS = [
  {
    id: "gpt-5.1-contex",
    label: "GPT-5.1 Contex"
  }
] as const;
export const DEFAULT_CODEX_MODEL = "gpt-5.1-contex";

export const DEFAULT_REASONING = "medium";
export const DEFAULT_QUERY_MODEL = CLAUDE_MODEL_SONNET;
