import path from "node:path";
import { cp, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(currentDir, "..");
const source = path.join(rootDir, "src", "templates");
const destination = path.join(rootDir, "dist", "templates");

await rm(destination, { recursive: true, force: true }).catch(() => {});
await cp(source, destination, { recursive: true });
