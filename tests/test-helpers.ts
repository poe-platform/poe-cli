import { Volume, createFsFromVolume } from "memfs";
import { Command } from "commander";
import type { FileSystem } from "../src/utils/file-system.js";

export function createHomeFs(homeDir: string): FileSystem {
  const vol = new Volume();
  vol.mkdirSync(homeDir, { recursive: true });
  return createFsFromVolume(vol).promises as unknown as FileSystem;
}

export function createTestProgram(argv: string[] = ["node", "cli"]): Command {
  const program = new Command();
  program.exitOverride();
  program
    .name("poe-code")
    .option("-y, --yes")
    .option("--dry-run")
    .option("--verbose");
  program.parse(argv);
  return program;
}
