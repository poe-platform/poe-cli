import path from "node:path";
import { cp, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(currentDir, "..");
const templateSource = path.join(rootDir, "src", "templates");
const templateDestination = path.join(rootDir, "dist", "templates");
await rm(templateDestination, { recursive: true, force: true }).catch(() => {});
await cp(templateSource, templateDestination, { recursive: true });
