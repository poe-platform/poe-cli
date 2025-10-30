import type { PromptDescriptor, PromptLibrary } from "./prompts.js";
import type { PromptFn } from "./types.js";

export interface ApiKeyStore {
  read(): Promise<string | null>;
  write(value: string): Promise<void>;
}

export interface EnsureOptionInput<TName extends string = string> {
  value?: string;
  fallback?: string;
  descriptor: PromptDescriptor<TName>;
}

export interface ResolveApiKeyInput {
  value?: string;
  dryRun: boolean;
}

export interface OptionResolvers {
  ensure<TName extends string>(
    input: EnsureOptionInput<TName>
  ): Promise<string>;
  resolveModel(
    value: string | undefined,
    defaultModel: string
  ): Promise<string>;
  resolveReasoning(
    value: string | undefined,
    defaultValue: string
  ): Promise<string>;
  resolveConfigName(
    value: string | undefined,
    defaultValue: string
  ): Promise<string>;
  resolveApiKey(input: ResolveApiKeyInput): Promise<string>;
  normalizeApiKey(value: string): string;
}

export interface OptionResolverInit {
  prompts: PromptFn;
  promptLibrary: PromptLibrary;
  apiKeyStore: ApiKeyStore;
}

export function createOptionResolvers(
  init: OptionResolverInit
): OptionResolvers {
  const ensure = async <TName extends string>(
    input: EnsureOptionInput<TName>
  ): Promise<string> => {
    if (input.value != null) {
      return input.value;
    }
    if (input.fallback != null) {
      return input.fallback;
    }
    const response = await init.prompts(input.descriptor);
    const result = response[input.descriptor.name];
    if (typeof result !== "string" || result.trim() === "") {
      throw new Error(`Missing value for "${input.descriptor.name}".`);
    }
    return result;
  };

  const normalizeApiKey = (value: string): string => {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      throw new Error("POE API key cannot be empty.");
    }
    return trimmed;
  };

  const resolveApiKey = async (
    input: ResolveApiKeyInput
  ): Promise<string> => {
    if (input.value != null) {
      const apiKey = normalizeApiKey(input.value);
      if (!input.dryRun) {
        await init.apiKeyStore.write(apiKey);
      }
      return apiKey;
    }

    const stored = await init.apiKeyStore.read();
    if (stored) {
      return normalizeApiKey(stored);
    }

    const descriptor = init.promptLibrary.apiKey();
    const response = await init.prompts(descriptor);
    const result = response[descriptor.name];
    if (typeof result !== "string") {
      throw new Error("POE API key is required.");
    }
    const apiKey = normalizeApiKey(result);
    if (!input.dryRun) {
      await init.apiKeyStore.write(apiKey);
    }
    return apiKey;
  };

  const resolveModel = async (
    value: string | undefined,
    defaultModel: string
  ): Promise<string> =>
    await ensure({
      value,
      descriptor: init.promptLibrary.model(defaultModel),
      fallback: defaultModel
    });

  const resolveReasoning = async (
    value: string | undefined,
    defaultValue: string
  ): Promise<string> =>
    await ensure({
      value,
      descriptor: init.promptLibrary.reasoningEffort(defaultValue),
      fallback: defaultValue
    });

  const resolveConfigName = async (
    value: string | undefined,
    defaultValue: string
  ): Promise<string> =>
    await ensure({
      value,
      descriptor: init.promptLibrary.configName(defaultValue),
      fallback: defaultValue
    });

  return {
    ensure,
    resolveModel,
    resolveReasoning,
    resolveConfigName,
    resolveApiKey,
    normalizeApiKey
  };
}
