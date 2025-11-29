import modelsConfig from "../config/models.json" assert { type: "json" };

type FrontierModel = {
  id: string;
  providerId: string;
  label: string;
};

type ClaudeVariant = "haiku" | "sonnet" | "opus";

type ClaudeCodeModel = {
  id: string;
  label: string;
  variant: ClaudeVariant;
};

type CodexModel = {
  id: string;
  label: string;
};

const frontierModels = modelsConfig.frontier.models as FrontierModel[];
const claudeCodeModels = modelsConfig.claudeCode.models as ClaudeCodeModel[];
const codexModels = modelsConfig.codex.models as CodexModel[];

export const FRONTIER_MODELS = frontierModels as ReadonlyArray<FrontierModel>;
export const DEFAULT_FRONTIER_MODEL = modelsConfig.frontier.default;

export const CLAUDE_CODE_MODELS =
  claudeCodeModels as ReadonlyArray<ClaudeCodeModel>;
export const DEFAULT_CLAUDE_CODE_MODEL = modelsConfig.claudeCode.default;

const claudeModelMap = claudeCodeModels.reduce<Record<ClaudeVariant, string>>(
  (acc, model) => {
    acc[model.variant] = model.id;
    return acc;
  },
  {
    haiku: claudeCodeModels[0]!.id,
    sonnet: claudeCodeModels[0]!.id,
    opus: claudeCodeModels[0]!.id
  }
);

export const CLAUDE_MODEL_HAIKU = claudeModelMap.haiku;
export const CLAUDE_MODEL_SONNET = claudeModelMap.sonnet;
export const CLAUDE_MODEL_OPUS = claudeModelMap.opus;

export const CODEX_MODELS = codexModels as ReadonlyArray<CodexModel>;
export const DEFAULT_CODEX_MODEL = modelsConfig.codex.default;

export const DEFAULT_REASONING = "medium";
export const DEFAULT_QUERY_MODEL = CLAUDE_MODEL_SONNET;
