import { describe, it, expect } from "vitest";
import { Volume, createFsFromVolume } from "memfs";
import path from "node:path";
import type { FileSystem } from "../src/utils/file-system.js";
import { preparePlaceholderPackage } from "../src/commands/publish-placeholder.js";

function createMemFs(): { fs: FileSystem; vol: Volume } {
  const vol = new Volume();
  const fs = createFsFromVolume(vol);
  return { fs: fs.promises as unknown as FileSystem, vol };
}

describe("publish placeholder task", () => {
  it("writes placeholder package files to target directory", async () => {
    const { fs } = createMemFs();
    const targetDir = "/workspace/placeholder";

    await preparePlaceholderPackage({
      fs,
      targetDir,
      packageName: "poe-setup"
    });

    const manifestPath = path.join(targetDir, "package.json");
    const manifestRaw = await fs.readFile(manifestPath, "utf8");
    const manifest = JSON.parse(manifestRaw);

    expect(manifest.name).toBe("poe-setup");
    expect(manifest.version).toBe("0.0.0-placeholder");
    expect(manifest.description).toContain("Placeholder");
    expect(manifest.bin).toEqual({ "poe-setup": "index.js" });
    expect(manifest.files).toEqual(["index.js", "README.md"]);

    const entry = await fs.readFile(path.join(targetDir, "index.js"), "utf8");
    expect(entry.startsWith("#!/usr/bin/env node")).toBe(true);
    expect(entry).toContain("Placeholder release for poe-setup");

    const readme = await fs.readFile(path.join(targetDir, "README.md"), "utf8");
    expect(readme).toContain("# poe-setup");
    expect(readme).toContain("placeholder release");
  });

  it("accepts custom package name", async () => {
    const { fs } = createMemFs();
    const targetDir = "/workspace/custom-placeholder";

    await preparePlaceholderPackage({
      fs,
      targetDir,
      packageName: "my-custom-package"
    });

    const manifestPath = path.join(targetDir, "package.json");
    const manifestRaw = await fs.readFile(manifestPath, "utf8");
    const manifest = JSON.parse(manifestRaw);

    expect(manifest.name).toBe("my-custom-package");
    expect(manifest.description).toContain("Placeholder release for my-custom-package");
    expect(manifest.bin).toEqual({ "my-custom-package": "index.js" });

    const entry = await fs.readFile(path.join(targetDir, "index.js"), "utf8");
    expect(entry).toContain("Placeholder release for my-custom-package");

    const readme = await fs.readFile(path.join(targetDir, "README.md"), "utf8");
    expect(readme).toContain("# my-custom-package");
    expect(readme).toContain("my-custom-package");
  });
});
