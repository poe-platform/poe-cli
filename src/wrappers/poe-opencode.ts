#!/usr/bin/env node

import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";

const configDir = join(homedir(), ".poe-code", "opencode");

process.env.OPENCODE_CONFIG_DIR = configDir;

const opencode = spawn("opencode", process.argv.slice(2), {
  stdio: "inherit",
  env: process.env
});

opencode.on("exit", (code) => {
  process.exit(code ?? 0);
});
