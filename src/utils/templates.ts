import { fileURLToPath } from "node:url";
import path from "node:path";
import { readFile } from "node:fs/promises";
import handlebars from "handlebars";

const templateRoot = fileURLToPath(new URL("../templates", import.meta.url));

type TemplateLoader = (relativePath: string) => Promise<string>;

let customLoader: TemplateLoader | null = null;

export async function renderTemplate(
  relativePath: string,
  context: Record<string, unknown>
): Promise<string> {
  const source = await loadTemplate(relativePath);
  const template = handlebars.compile(source);
  return template(context);
}

export function setTemplateLoader(loader: TemplateLoader | null): void {
  customLoader = loader;
}

async function loadTemplate(relativePath: string): Promise<string> {
  if (customLoader) {
    return customLoader(relativePath);
  }
  const templatePath = path.join(templateRoot, relativePath);
  return readFile(templatePath, "utf8");
}
