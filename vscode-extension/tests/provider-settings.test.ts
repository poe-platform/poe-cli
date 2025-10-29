import { describe, it, expect, vi, beforeEach } from "vitest";

const readFile = vi.fn<Promise<string>, [string, string]>();

vi.mock("node:fs", () => ({
  promises: {
    readFile,
  },
}));

describe("loadProviderSettings", () => {
  beforeEach(() => {
    readFile.mockReset();
  });

  it("parses provider manifest entries", async () => {
    const { loadProviderSettings } = await import(
      "../src/config/provider-settings.js"
    );
    readFile.mockResolvedValueOnce(
      JSON.stringify({
        services: [
          { id: "anthropic.claude", label: "Claude" },
          { id: "openai.gpt4o", label: "GPT-4o" },
          { id: 3, label: null },
        ],
      })
    );

    const providers = await loadProviderSettings("/workspace");

    expect(readFile).toHaveBeenCalledWith(
      "/workspace/dist/services/manifest.json",
      "utf8"
    );
    expect(providers).toEqual([
      { id: "anthropic.claude", label: "Claude" },
      { id: "openai.gpt4o", label: "GPT-4o" },
    ]);
  });

  it("returns empty array when manifest missing", async () => {
    const { loadProviderSettings } = await import(
      "../src/config/provider-settings.js"
    );
    readFile.mockRejectedValueOnce(new Error("not found"));

    const providers = await loadProviderSettings("/workspace");
    expect(providers).toEqual([]);
  });
});
