import path from "node:path";
import type { FileSystem } from "../utils/file-system.js";
import { renderTemplate } from "../utils/templates.js";

export interface InitOptions {
  fs: FileSystem;
  cwd: string;
  projectName: string;
  apiKey: string;
  model: string;
}

export async function initProject(options: InitOptions): Promise<void> {
  const { fs, cwd, projectName, apiKey, model } = options;
  const projectDir = path.join(cwd, projectName);

  if (await pathExists(fs, projectDir)) {
    throw new Error(`Project directory "${projectName}" already exists`);
  }

  await fs.mkdir(projectDir, { recursive: true });

  await Promise.all([
    writeTemplate(fs, projectDir, ".env", "python/env.hbs", { apiKey, model }),
    writeTemplate(fs, projectDir, "main.py", "python/main.py.hbs", {
      apiKey,
      model
    }),
    writeTemplate(
      fs,
      projectDir,
      "requirements.txt",
      "python/requirements.txt.hbs",
      {}
    )
  ]);
}

async function writeTemplate(
  fs: FileSystem,
  projectDir: string,
  filename: string,
  templatePath: string,
  context: Record<string, unknown>
): Promise<void> {
  const rendered = await renderTemplate(templatePath, context);
  await fs.writeFile(path.join(projectDir, filename), rendered, {
    encoding: "utf8"
  });
}

async function pathExists(fs: FileSystem, target: string): Promise<boolean> {
  try {
    await fs.stat(target);
    return true;
  } catch (error) {
    if (isNotFound(error)) {
      return false;
    }
    throw error;
  }
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "ENOENT"
  );
}
