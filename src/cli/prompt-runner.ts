import type prompts from "prompts";
import { OperationCancelledError } from "./errors.js";
import type { PromptFn } from "./types.js";

export function createPromptRunner(
  promptsImpl: typeof prompts
): PromptFn {
  return (questions) =>
    promptsImpl(questions as any, {
      onCancel: () => {
        throw new OperationCancelledError();
      }
    }) as Promise<Record<string, unknown>>;
}
