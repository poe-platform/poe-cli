import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(currentDir, "..");
const distDir = path.join(rootDir, "dist");
const binDir = path.join(distDir, "bin");

const providersModule = await import(
  pathToFileURL(path.join(distDir, "providers", "index.js")).href
);
const aliasesModule = await import(
  pathToFileURL(path.join(distDir, "cli", "binary-aliases.js")).href
);

const providers = providersModule.getDefaultProviders();
const aliases = aliasesModule.deriveWrapBinaryAliases(providers);

await mkdir(binDir, { recursive: true });

for (const alias of aliases) {
  const filePath = path.join(binDir, `${alias.binName}.js`);
  const content = [
    "#!/usr/bin/env node",
    'import { spawn } from "node:child_process";',
    'import path from "node:path";',
    'import { fileURLToPath } from "node:url";',
    "",
    "const currentFile = fileURLToPath(import.meta.url);",
    "const distDir = path.resolve(path.dirname(currentFile), \"..\");",
    "const entry = path.join(distDir, \"index.js\");",
    `const service = ${JSON.stringify(alias.serviceName)};`,
    "const agentArgs = process.argv.slice(2);",
    "const args = [entry, \"wrap\", service, \"--\", ...agentArgs];",
    "const child = spawn(process.execPath, args, { stdio: \"inherit\" });",
    "child.on(\"close\", (code) => process.exit(code ?? 0));",
    "child.on(\"error\", (error) => {",
    "  throw error;",
    "});",
    ""
  ].join("\n");
  await writeFile(filePath, content, { encoding: "utf8" });
}

