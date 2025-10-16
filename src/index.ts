#!/usr/bin/env node
import * as nodeFs from "node:fs/promises";
import { realpathSync } from "node:fs";
import { homedir } from "node:os";
import { pathToFileURL } from "node:url";
import prompts from "prompts";
import { createProgram } from "./cli/program.js";
import type { FileSystem } from "./utils/file-system.js";

const fsAdapter = nodeFs as unknown as FileSystem;

async function main(): Promise<void> {
  const program = createProgram({
    fs: fsAdapter,
    prompts: (questions) =>
      prompts(questions as any, {
        onCancel: () => {
          throw new Error("Operation cancelled.");
        }
      }) as Promise<Record<string, unknown>>,
    env: {
      cwd: process.cwd(),
      homeDir: homedir()
    },
    logger: (message) => {
      console.log(message);
    },
    exitOverride: false
  });

  try {
    await program.parseAsync(process.argv);
  } catch (error) {
    if (error instanceof Error) {
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }
}

if (isCliInvocation(process.argv, import.meta.url)) {
  void main();
}

function isCliInvocation(
  argv: string[],
  moduleUrl: string,
  realpath: (path: string) => string = realpathSync
): boolean {
  const entry = argv.at(1);
  if (typeof entry !== "string") {
    return false;
  }

  const candidates = [pathToFileURL(entry).href];

  try {
    candidates.push(pathToFileURL(realpath(entry)).href);
  } catch {
    // Ignore resolution errors; fall back to direct comparison.
  }

  return candidates.includes(moduleUrl);
}

export { main, isCliInvocation };
