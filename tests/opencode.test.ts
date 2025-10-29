import { describe, it, expect, beforeEach, vi } from "vitest";
import { Volume, createFsFromVolume } from "memfs";
import path from "node:path";
import type { FileSystem } from "../src/utils/file-system.js";
import * as opencodeService from "../src/services/opencode.js";

function createMemFs(): { fs: FileSystem; vol: Volume } {
  const vol = new Volume();
  const fs = createFsFromVolume(vol);
  return { fs: fs.promises as unknown as FileSystem, vol };
}

describe("opencode service", () => {
  let fs: FileSystem;
  let vol: Volume;
  const homeDir = "/home/user";
  const configPath = path.join(homeDir, ".config", "opencode", "config.json");
  const authPath = path.join(
    homeDir,
    ".local",
    "share",
    "opencode",
    "auth.json"
  );

  beforeEach(() => {
    ({ fs, vol } = createMemFs());
    vol.mkdirSync(homeDir, { recursive: true });
  });

  it("creates the opencode config and auth files", async () => {
    await opencodeService.configureOpenCode({
      fs,
      configPath,
      authPath,
      apiKey: "sk-test"
    });

    const config = JSON.parse(await fs.readFile(configPath, "utf8"));
    expect(config).toEqual({
      $schema: "https://opencode.ai/config.json",
      provider: {
        poe: {
          npm: "@ai-sdk/openai-compatible",
          name: "poe.com",
          options: {
            baseURL: "https://api.poe.com/v1"
          },
          models: {
            "Claude-Sonnet-4.5": {
              name: "Claude Sonnet 4.5"
            },
            "GPT-5-Codex": {
              name: "GPT-5-Codex"
            }
          }
        }
      }
    });

    const auth = JSON.parse(await fs.readFile(authPath, "utf8"));
    expect(auth).toEqual({
      poe: {
        type: "api",
        key: "sk-test"
      }
    });
  });

  it("merges with existing config and preserves other providers", async () => {
    await fs.mkdir(path.dirname(configPath), { recursive: true });
    await fs.writeFile(
      configPath,
      JSON.stringify(
        {
          provider: {
            local: {
              name: "local",
              models: ["foo"]
            }
          }
        },
        null,
        2
      )
    );

    await opencodeService.configureOpenCode({
      fs,
      configPath,
      authPath,
      apiKey: "sk-test"
    });

    const config = JSON.parse(await fs.readFile(configPath, "utf8"));
    expect(config.provider.local).toEqual({
      name: "local",
      models: ["foo"]
    });
    expect(config.provider.poe).toMatchObject({
      npm: "@ai-sdk/openai-compatible",
      models: {
        "Claude-Sonnet-4.5": {
          name: "Claude Sonnet 4.5"
        }
      }
    });
    expect(config.$schema).toBe("https://opencode.ai/config.json");
  });

  it("replaces the Poe auth entry while keeping other providers", async () => {
    await fs.mkdir(path.dirname(authPath), { recursive: true });
    await fs.writeFile(
      authPath,
      JSON.stringify(
        {
          poe: {
            type: "legacy",
            key: "old-key"
          },
          openai: {
            type: "api",
            key: "openai-key"
          }
        },
        null,
        2
      )
    );

    await opencodeService.configureOpenCode({
      fs,
      configPath,
      authPath,
      apiKey: "sk-test"
    });

    const auth = JSON.parse(await fs.readFile(authPath, "utf8"));
    expect(auth).toEqual({
      poe: {
        type: "api",
        key: "sk-test"
      },
      openai: {
        type: "api",
        key: "openai-key"
      }
    });
  });

  it("spawns the opencode CLI with the provided prompt and args", async () => {
    const runCommand = vi.fn(async () => ({
      stdout: "opencode-output\n",
      stderr: "",
      exitCode: 0
    }));

    const result = await opencodeService.spawnOpenCode({
      prompt: "List all files",
      args: ["--format", "markdown"],
      runCommand
    });

    expect(runCommand).toHaveBeenCalledWith("opencode", [
      "prompt",
      "List all files",
      "--format",
      "markdown"
    ]);
    expect(result).toEqual({
      stdout: "opencode-output\n",
      stderr: "",
      exitCode: 0
    });
  });
});
