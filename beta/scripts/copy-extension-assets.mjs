import path from "node:path";
import { cp, rm, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(currentDir, "..");

const bundledCssSource = path.join(
  rootDir,
  "vscode-extension",
  "preview",
  "public",
  "preview.css"
);
const cssDestinationDir = path.join(
  rootDir,
  "vscode-extension",
  "out",
  "webview",
  "styles"
);
const cssDestinationFile = path.join(cssDestinationDir, "tailwind.css");

await rm(cssDestinationDir, { recursive: true, force: true }).catch(() => {});
await mkdir(cssDestinationDir, { recursive: true });

try {
  await cp(bundledCssSource, cssDestinationFile, { recursive: false });
} catch (error) {
  await writeFile(cssDestinationFile, "", "utf8");
  console.warn(
    "[copy-extension-assets] Missing preview.css build output. Tailwind styles will be empty.",
    error?.message ?? error
  );
}
