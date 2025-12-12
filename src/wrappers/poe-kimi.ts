#!/usr/bin/env node

import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";

const configDir = join(homedir(), ".poe-code", "kimi");

process.env.KIMI_CONFIG_DIR = configDir;

const kimi = spawn("kimi", process.argv.slice(2), {
  stdio: "inherit",
  env: process.env
});

kimi.on("exit", (code) => {
  process.exit(code ?? 0);
});
