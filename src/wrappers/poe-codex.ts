#!/usr/bin/env node

import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";

const configDir = join(homedir(), ".poe-code", "codex");

process.env.CODEX_HOME = configDir;
process.env.XDG_CONFIG_HOME = configDir;

const codex = spawn("codex", process.argv.slice(2), {
  stdio: "inherit",
  env: process.env
});

codex.on("exit", (code) => {
  process.exit(code ?? 0);
});
