import { describe, it, expect, vi } from "vitest";
import { createOptionResolvers } from "../src/cli/options.js";
import { createPromptLibrary } from "../src/cli/prompts.js";

describe("option resolvers", () => {
  it("uses the login API key prompt when a key is missing", async () => {
    const promptLibrary = createPromptLibrary();
    const prompts = vi
      .fn()
      .mockImplementation(async (descriptor: { name: string }) => ({
        [descriptor.name]: "prompt-key"
      }));
    const apiKeyStore = {
      read: vi.fn().mockResolvedValue(null),
      write: vi.fn().mockResolvedValue(undefined)
    };
    const resolvers = createOptionResolvers({
      prompts,
      promptLibrary,
      apiKeyStore
    });

    const result = await resolvers.resolveApiKey({
      value: undefined,
      dryRun: false
    });

    expect(result).toBe("prompt-key");
    expect(prompts).toHaveBeenCalledTimes(1);
    const [descriptor] = prompts.mock.calls[0]!;
    expect(descriptor.message).toContain("Enter your Poe API key");
  });
});
