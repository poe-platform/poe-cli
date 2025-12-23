import { describe, it, expect, vi } from "vitest";
import { createCliContainer } from "../src/cli/container.js";
import { listIsolatedServiceIds } from "../src/cli/commands/shared.js";
import { createProviderStub } from "./provider-stub.js";
import type { FileSystem } from "../src/utils/file-system.js";
import { createHomeFs } from "./test-helpers.js";

const cwd = "/repo";
const homeDir = "/home/test";

describe("listIsolatedServiceIds", () => {
  let fs: FileSystem;

  beforeEach(() => {
    fs = createHomeFs(homeDir);
  });

  it("collects providers that declare an isolated environment", () => {
    const container = createCliContainer({
      fs,
      prompts: vi.fn(),
      env: { cwd, homeDir },
      logger: () => {}
    });

    expect(listIsolatedServiceIds(container)).toEqual([
      "claude-code",
      "codex",
      "opencode"
    ]);
  });

  it("includes additional registered isolated providers", () => {
    const container = createCliContainer({
      fs,
      prompts: vi.fn(),
      env: { cwd, homeDir },
      logger: () => {}
    });

    container.registry.register(
      createProviderStub({
        name: "custom-isolated",
        label: "Custom Isolated",
        isolatedEnv: {
          agentBinary: "custom",
          configProbe: { kind: "isolatedDir" },
          env: {}
        }
      })
    );

    expect(listIsolatedServiceIds(container)).toEqual([
      "claude-code",
      "codex",
      "opencode",
      "custom-isolated"
    ]);
  });
});
