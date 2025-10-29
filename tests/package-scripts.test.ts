import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

type PackageJson = {
  scripts?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

const readRootPackageJson = (): PackageJson => {
  const path = join(process.cwd(), "package.json");
  const raw = readFileSync(path, "utf8");
  return JSON.parse(raw) as PackageJson;
};

describe("package scripts", () => {
  it("runs both root and VSCode extension tests", () => {
    const pkg = readRootPackageJson();
    const testScript = pkg.scripts?.test ?? "";
    expect(testScript.includes("npm run test --prefix vscode-extension")).toBe(
      true
    );
  });

  it("includes a build command for the VSCode extension", () => {
    const pkg = readRootPackageJson();
    const buildExtension = pkg.scripts?.["build:extension"] ?? "";
    expect(
      buildExtension.includes("npm run compile --prefix vscode-extension")
    ).toBe(true);
  });

  it("wires ESLint and Prettier commands", () => {
    const pkg = readRootPackageJson();
    const scripts = pkg.scripts ?? {};
    const devDependencies = pkg.devDependencies ?? {};
    expect(scripts.lint).toBeDefined();
    expect(scripts.lint?.includes("eslint")).toBe(true);
    expect(scripts.format).toBeDefined();
    expect(scripts.format?.includes("prettier --check .")).toBe(true);
    expect(scripts["format:write"]).toBeDefined();
    expect(scripts["format:write"]?.includes("prettier --write .")).toBe(true);
    expect(devDependencies.eslint).toBeDefined();
    expect(devDependencies.prettier).toBeDefined();
  });
});
