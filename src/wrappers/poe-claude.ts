#!/usr/bin/env node

import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";

const configDir = join(homedir(), ".poe-code", "claude-code");

process.env.CLAUDE_CONFIG_DIR = configDir;

const claude = spawn("claude", process.argv.slice(2), {
  stdio: "inherit",
  env: process.env
});

claude.on("exit", (code) => {
  process.exit(code ?? 0);
});
