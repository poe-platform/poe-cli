import { describe, it, expect, vi } from "vitest";
import { createPromptRunner } from "../src/cli/prompt-runner.js";
import { OperationCancelledError } from "../src/cli/errors.js";

describe("createPromptRunner", () => {
  it("wraps the prompts implementation", async () => {
    const promptsMock = vi.fn().mockResolvedValue({ value: true });
    const runner = createPromptRunner(promptsMock as any);

    const result = await runner([] as any);

    expect(promptsMock).toHaveBeenCalled();
    expect(result).toEqual({ value: true });
  });

  it("throws a user-facing error on cancellation", () => {
    let capturedOnCancel: (() => void) | undefined;
    const promptsMock = vi.fn((_questions, options) => {
      capturedOnCancel = options?.onCancel;
      return Promise.resolve({});
    });
    const runner = createPromptRunner(promptsMock as any);

    void runner([] as any);

    expect(typeof capturedOnCancel).toBe("function");
    let thrown: unknown;
    try {
      capturedOnCancel?.();
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(OperationCancelledError);
    expect((thrown as OperationCancelledError).isUserError).toBe(true);
  });
});
