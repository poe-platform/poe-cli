import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Command } from "commander";

const logErrorWithStackTrace = vi.fn();
let capturedOptions: any;

vi.mock("../src/cli/error-logger.js", async () => {
  const actual = await vi.importActual<Record<string, unknown>>(
    "../src/cli/error-logger.js"
  );
  return {
    ...actual,
    ErrorLogger: vi.fn().mockImplementation((options) => {
      capturedOptions = options;
      return {
        logErrorWithStackTrace
      };
    })
  };
});

describe("createCliMain", () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let originalEnvValue: string | undefined;

  beforeEach(() => {
    capturedOptions = undefined;
    logErrorWithStackTrace.mockReset();
    originalEnvValue = process.env.POE_CODE_STDERR_LOGS;
    process.env.POE_CODE_STDERR_LOGS = "1";
    exitSpy = vi.spyOn(process, "exit").mockImplementation((code?: number) => {
      throw new Error(`exit:${code ?? "undefined"}`);
    });
  });

  afterEach(() => {
    if (originalEnvValue === undefined) {
      delete process.env.POE_CODE_STDERR_LOGS;
    } else {
      process.env.POE_CODE_STDERR_LOGS = originalEnvValue;
    }
    exitSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it("enables stderr logging for bootstrap errors", async () => {
    const parseAsync = vi.fn(async () => {
      throw new Error("boom");
    });

    const fakeProgram: Partial<Command> & { parseAsync: () => Promise<void> } = {
      parseAsync
    };

    const { createCliMain } = await import("../src/cli/bootstrap.js");
    const main = createCliMain(() => fakeProgram as Command);

    await expect(main()).rejects.toThrow("exit:1");

    expect(parseAsync).toHaveBeenCalled();
    expect(logErrorWithStackTrace).toHaveBeenCalledWith(
      expect.any(Error),
      "CLI execution",
      expect.objectContaining({ component: "main" })
    );
    expect(capturedOptions).toMatchObject({ logToStderr: true });
  });
});
