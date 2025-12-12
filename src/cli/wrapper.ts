#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { existsSync } from "node:fs";
import { join } from "node:path";

interface WrapperConfig {
  binaryName: string;
  configDir: string;
  envVars?: Record<string, string>;
}

const WRAPPER_CONFIGS: Record<string, WrapperConfig> = {
  "poe-claude": {
    binaryName: "claude",
    configDir: join(homedir(), ".poe-code", "claude-code"),
    envVars: {
      CLAUDE_CONFIG_DIR: join(homedir(), ".poe-code", "claude-code")
    }
  },
  "poe-codex": {
    binaryName: "codex",
    configDir: join(homedir(), ".poe-code", "codex"),
    envVars: {
      CODEX_HOME: join(homedir(), ".poe-code", "codex"),
      XDG_CONFIG_HOME: join(homedir(), ".poe-code", "codex")
    }
  },
  "poe-opencode": {
    binaryName: "opencode",
    configDir: join(homedir(), ".poe-code", "opencode"),
    envVars: {
      XDG_CONFIG_HOME: join(homedir(), ".poe-code", "opencode"),
      XDG_DATA_HOME: join(homedir(), ".poe-code", "opencode")
    }
  },
  "poe-kimi": {
    binaryName: "kimi",
    configDir: join(homedir(), ".poe-code", "kimi"),
    envVars: {
      KIMI_CONFIG_DIR: join(homedir(), ".poe-code", "kimi")
    }
  }
};

function findBinary(name: string): string | null {
  const result = spawnSync("which", [name], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"]
  });

  if (result.status === 0) {
    return result.stdout.trim();
  }

  return null;
}

function runWrapper(wrapperName: string): void {
  const config = WRAPPER_CONFIGS[wrapperName];

  if (!config) {
    console.error(`Unknown wrapper: ${wrapperName}`);
    process.exit(1);
  }

  if (!existsSync(config.configDir)) {
    console.error(`Configuration not found at ${config.configDir}`);
    console.error(`Run 'poe-code configure ${config.binaryName}' first`);
    process.exit(1);
  }

  const binaryPath = findBinary(config.binaryName);

  if (!binaryPath) {
    console.error(`Binary '${config.binaryName}' not found in PATH`);
    console.error(`Run 'poe-code install ${config.binaryName}' first`);
    process.exit(1);
  }

  const env = {
    ...process.env,
    ...config.envVars
  };

  const args = process.argv.slice(2);

  const result = spawnSync(binaryPath, args, {
    stdio: "inherit",
    env
  });

  process.exit(result.status ?? 1);
}

export function main(): void {
  const scriptName = process.argv[1];
  const wrapperName = scriptName ? scriptName.split("/").pop()?.replace(/\.js$/, "") : "";

  if (wrapperName && WRAPPER_CONFIGS[wrapperName]) {
    runWrapper(wrapperName);
  } else {
    console.error(
      "This script must be invoked as one of: poe-claude, poe-codex, poe-opencode, poe-kimi"
    );
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
