import { describe, expect, it, vi } from "vitest";
import { Volume, createFsFromVolume } from "memfs";
import type { FileSystem } from "../src/utils/file-system.js";
import type { ErrorLogger } from "../src/cli/error-logger.js";
import { resolveFileMentions } from "../src/cli/file-mentions.js";

function createMemFs(): { fs: FileSystem; vol: Volume } {
  const vol = new Volume();
  const fs = createFsFromVolume(vol);
  return { fs: fs.promises as unknown as FileSystem, vol };
}

describe("resolveFileMentions", () => {
  it("logs errors when a mentioned file cannot be read", async () => {
    const { fs, vol } = createMemFs();
    const cwd = "/workspace";
    vol.mkdirSync(cwd, { recursive: true });
    vol.writeFileSync(`${cwd}/exists.txt`, "hello");

    const error = new Error("permission denied");
    const readFile = vi
      .fn(fs.readFile.bind(fs))
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce("hello");

    const errorLogger: Pick<
      ErrorLogger,
      "logErrorWithStackTrace" | "logError"
    > = {
      logErrorWithStackTrace: vi.fn(),
      logError: vi.fn()
    };

    const result = await resolveFileMentions({
      input: "check @missing.txt and @exists.txt",
      cwd,
      readFile,
      errorLogger: errorLogger as ErrorLogger
    });

    expect(result.processedInput).toContain("[Error reading missing.txt:");
    expect(result.processedInput).toContain("exists.txt ---");
    expect(errorLogger.logErrorWithStackTrace).toHaveBeenCalledTimes(1);
    expect(errorLogger.logErrorWithStackTrace).toHaveBeenCalledWith(
      error,
      "interactive file mention",
      expect.objectContaining({
        mention: "missing.txt",
        cwd,
        absolutePath: `${cwd}/missing.txt`
      })
    );
  });
});
