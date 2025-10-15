import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import handlebars from "handlebars";

const templateRoot = fileURLToPath(new URL("../templates", import.meta.url));

export async function renderTemplate(
  relativePath: string,
  context: Record<string, unknown>
): Promise<string> {
  const templatePath = path.join(templateRoot, relativePath);
  const source = await readFile(templatePath, "utf8");
  const template = handlebars.compile(source);
  return template(context);
}
