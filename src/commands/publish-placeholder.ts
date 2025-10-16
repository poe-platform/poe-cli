import path from "node:path";
import type { FileSystem } from "../utils/file-system.js";

export interface PreparePlaceholderPackageOptions {
  fs: FileSystem;
  targetDir: string;
  packageName: string;
  version?: string;
}

const DEFAULT_VERSION = "0.0.0-placeholder";

export async function preparePlaceholderPackage(
  options: PreparePlaceholderPackageOptions
): Promise<void> {
  const {
    fs,
    targetDir,
    packageName,
    version = DEFAULT_VERSION
  } = options;

  await fs.mkdir(targetDir, { recursive: true });

  const manifestPath = path.join(targetDir, "package.json");
  const manifest = JSON.stringify(
    createManifest(packageName, version),
    null,
    2
  );
  await fs.writeFile(manifestPath, `${manifest}\n`, { encoding: "utf8" });

  const entryPath = path.join(targetDir, "index.js");
  await fs.writeFile(entryPath, createEntryPoint(packageName), {
    encoding: "utf8"
  });

  const readmePath = path.join(targetDir, "README.md");
  await fs.writeFile(readmePath, createReadme(packageName), {
    encoding: "utf8"
  });
}

function createManifest(packageName: string, version: string) {
  return {
    name: packageName,
    version,
    description: `Placeholder release for ${packageName} to reserve the package name.`,
    bin: {
      [packageName]: "index.js"
    },
    files: ["index.js", "README.md"],
    keywords: ["placeholder"],
    license: "MIT"
  };
}

function createEntryPoint(packageName: string): string {
  const message = `Placeholder release for ${packageName}. Full CLI coming soon.`;
  return [
    "#!/usr/bin/env node",
    `'use strict';`,
    "",
    `console.log("${message}");`,
    ""
  ].join("\n");
}

function createReadme(packageName: string): string {
  return [
    `# ${packageName}`,
    "",
    `This is a placeholder release published to reserve the \`${packageName}\` package name.`,
    "",
    "The full CLI will be published once it is ready. Stay tuned!"
  ].join("\n");
}
