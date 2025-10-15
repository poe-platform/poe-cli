#!/usr/bin/env node
import * as nodeFs from "node:fs/promises";
import { homedir } from "node:os";
import { pathToFileURL } from "node:url";
import prompts from "prompts";
import { createProgram } from "./cli/program";
import type { FileSystem } from "./utils/file-system";

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

const isMainModule =
  typeof process.argv[1] === "string" &&
  pathToFileURL(process.argv[1]).href === import.meta.url;

if (isMainModule) {
  void main();
}

export { main };
