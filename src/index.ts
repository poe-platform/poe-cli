#!/usr/bin/env node
import * as nodeFs from "node:fs/promises";
import * as nodeFsSync from "node:fs";
import { realpathSync } from "node:fs";
import { homedir } from "node:os";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import prompts from "prompts";
import { createProgram } from "./cli/program.js";
import type { FileSystem } from "./utils/file-system.js";
import { ErrorLogger } from "./cli/error-logger.js";
import { CliError } from "./cli/errors.js";

const fsAdapter = nodeFs as unknown as FileSystem;

async function main(): Promise<void> {
  const homeDir = homedir();
  const logDir = join(homeDir, ".poe-setup", "logs");

  // Create global error logger for bootstrapping errors
  const errorLogger = new ErrorLogger({
    fs: nodeFsSync as any,
    logDir,
    logToStderr: false // Only log to file at this level
  });

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
      homeDir,
      platform: process.platform,
      variables: process.env
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
      // Log error with full context
      errorLogger.logErrorWithStackTrace(error, "CLI execution", {
        component: "main",
        argv: process.argv
      });

      // Display user-friendly message
      if (error instanceof CliError && error.isUserError) {
        console.error(error.message);
      } else {
        console.error(`Error: ${error.message}`);
        console.error(
          `See logs at ${join(logDir, "errors.log")} for more details.`
        );
      }

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
