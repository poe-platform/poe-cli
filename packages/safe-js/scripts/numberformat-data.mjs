import { readFile, readdir, mkdir, writeFile, copyFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

function localeRegistration(source, filename, owner) {
  const parsed = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  if (parsed.parseDiagnostics.length !== 0 || parsed.statements.length !== 1 || !ts.isIfStatement(parsed.statements[0]))
    throw new TypeError(`Unexpected locale script: ${filename}`);
  const statement = parsed.statements[0].thenStatement;
  if (!ts.isBlock(statement) || statement.statements.length !== 1 || !ts.isExpressionStatement(statement.statements[0]))
    throw new TypeError(`Unexpected locale registration: ${filename}`);
  const call = statement.statements[0].expression;
  if (!ts.isCallExpression(call) || call.expression.getText(parsed) !== `Intl.${owner}.__addLocaleData` || call.arguments.length !== 1)
    throw new TypeError(`Unexpected locale registration: ${filename}`);
  return { parsed, argument: call.arguments[0] };
}

export function extractNumberFormatData(source, filename) {
  const { parsed, argument } = localeRegistration(source, filename, "NumberFormat");
  const value = JSON.parse(argument.getText(parsed));
  if (value === null || typeof value !== "object" || Object.keys(value).length !== 2 ||
      typeof value.locale !== "string" || value.data === null || typeof value.data !== "object" || Array.isArray(value.data) ||
      Intl.getCanonicalLocales(value.locale)[0] !== value.locale)
    throw new TypeError(`Invalid locale data: ${filename}`);
  return value;
}

export function extractPluralRulesData(source, filename) {
  const { parsed, argument } = localeRegistration(source, filename, "PluralRules");
  if (!ts.isObjectLiteralExpression(argument)) throw new TypeError("Invalid plural locale record.");
  const locale = argument.properties.find(property => ts.isPropertyAssignment(property) &&
    (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) && property.name.text === "locale");
  if (locale === undefined || !ts.isStringLiteral(locale.initializer) || Intl.getCanonicalLocales(locale.initializer.text).length !== 1)
    throw new TypeError("Invalid plural locale name.");
  const check = node => {
    if (ts.isFunctionExpression(node)) return;
    if (ts.isCallExpression(node) || ts.isNewExpression(node) || ts.isSpreadAssignment(node) || ts.isComputedPropertyName(node) || ts.isGetAccessor(node) || ts.isSetAccessor(node))
      throw new TypeError("Executable plural data initializer.");
    ts.forEachChild(node, check);
  };
  check(argument);
  const replacements = [];
  const unwrap = node => ts.isParenthesizedExpression(node) ? unwrap(node.expression) : node;
  const isNumberOperand = node => {
    node = unwrap(node);
    return ts.isIdentifier(node) && node.text === "n" ||
      ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PercentToken && isNumberOperand(node.left);
  };
  const fixRanges = node => {
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
      const left = unwrap(node.left), right = unwrap(node.right);
      if (ts.isBinaryExpression(left) && ts.isBinaryExpression(right) &&
          left.operatorToken.kind === ts.SyntaxKind.GreaterThanEqualsToken && right.operatorToken.kind === ts.SyntaxKind.LessThanEqualsToken &&
          isNumberOperand(left.left) && left.left.getText(parsed) === right.left.getText(parsed)) {
        // CLDR a..b relations enumerate integers; the published functions omit
        // this guard for n, incorrectly admitting values such as Arabic 3.14.
        replacements.push({ start: node.getStart(parsed), end: node.end, text: `Number.isInteger(n) && (${node.getText(parsed)})` });
        return;
      }
    }
    ts.forEachChild(node, fixRanges);
  };
  fixRanges(argument);
  let expression = argument.getText(parsed);
  const start = argument.getStart(parsed);
  for (const replacement of replacements.sort((a, b) => b.start - a.start))
    expression = expression.slice(0, replacement.start - start) + replacement.text + expression.slice(replacement.end - start);
  return { locale: locale.initializer.text, expression };
}

export function isolateNumberFormatEngine(source, license) {
  const parsed = ts.createSourceFile("numberformat.js", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  if (parsed.parseDiagnostics.length !== 0 || license.includes("*/")) throw new TypeError("Invalid number engine source.");
  let pluralReferences = 0;
  const inspect = node => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === "Intl")
      throw new TypeError("Number engine already declares Intl.");
    if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "Intl" && node.name.text === "PluralRules") pluralReferences++;
    ts.forEachChild(node, inspect);
  };
  inspect(parsed);
  if (pluralReferences === 0) throw new TypeError("Missing number engine plural dependency.");
  const comments = ts.getLeadingCommentRanges(source, parsed.statements.at(-1)?.end ?? 0) ?? [];
  for (const comment of [...comments].reverse())
    if (comment.kind === ts.SyntaxKind.SingleLineCommentTrivia && source.slice(comment.pos, comment.end).startsWith("//# sourceMappingURL="))
      source = source.slice(0, comment.pos) + source.slice(comment.end);
  return `/*!\n${license}\n*/\nimport { numberFormatIntl as Intl } from "../../interp/numberformat-pluralrules.js";\n${source}`;
}

export function numberFormatDataModule(values, license = "") {
  const sorted = [...values].sort((a, b) => a.locale < b.locale ? -1 : a.locale > b.locale ? 1 : 0);
  if (new Set(sorted.map(value => value.locale)).size !== sorted.length) throw new TypeError("Duplicate NumberFormat locale.");
  if (license.includes("*/")) throw new TypeError("Invalid locale-data license comment.");
  const nodes = [];
  const ids = new Map();
  const encode = value => {
    const key = JSON.stringify(value);
    if (ids.has(key)) return ids.get(key);
    const node = value === null || typeof value !== "object" ? value
      : Array.isArray(value) ? [0, ...value.map(encode)]
      : [1, ...Object.entries(value).flatMap(([name, child]) => [encode(name), encode(child)])];
    const id = nodes.length;
    nodes.push(node);
    ids.set(key, id);
    return id;
  };
  const roots = sorted.map(value => [value.locale, encode(value)]);
  // Intern serialized data, not live objects: each factory expands a fresh tree.
  // Parsing is deferred until the first locale request, including in source bundles.
  return (license === "" ? "" : `/*!\n${license}\n*/\n`) + "// Generated from pinned FormatJS locale data. Do not edit.\n" +
    `let nodes;\nfunction expand(id) {\n  nodes ??= JSON.parse(${JSON.stringify(JSON.stringify(nodes))});\n` +
    "  const node = nodes[id];\n  if (!Array.isArray(node)) return node;\n" +
    "  if (node[0] === 0) return node.slice(1).map(expand);\n" +
    "  const entries = [];\n  for (let index = 1; index < node.length; index += 2) entries.push([expand(node[index]), expand(node[index + 1])]);\n" +
    "  return Object.fromEntries(entries);\n}\nexport const localeData = Object.freeze({\n" +
    roots.map(([locale, id]) => `${JSON.stringify(locale)}: () => (expand(${id}))`).join(",\n") +
    "\n});\n";
}

export function isolatePluralRulesEngine(source, license) {
  const parsed = ts.createSourceFile("pluralrules.js", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  if (parsed.parseDiagnostics.length !== 0 || license.includes("*/")) throw new TypeError("Invalid plural engine source.");
  const selector = parsed.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "PluralRuleSelect");
  const resolver = parsed.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "ResolvePluralInternal");
  if (selector?.parameters.length !== 4 || resolver === undefined) throw new TypeError("Unexpected plural engine selection shape.");
  const calls = [];
  const inspect = node => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "PluralRuleSelect") calls.push(node);
    ts.forEachChild(node, inspect);
  };
  inspect(resolver);
  const call = calls[0];
  if (calls.length !== 1 || call.arguments.map(argument => argument.getText(parsed)).join("|") !== "locale|type|n|GetOperands(s, exponent)")
    throw new TypeError("Unexpected plural engine operand path.");
  const classes = [];
  const findClass = node => {
    if ((ts.isClassExpression(node) || ts.isClassDeclaration(node)) && node.name?.text === "PluralRules") classes.push(node);
    ts.forEachChild(node, findClass);
  };
  findClass(parsed);
  const method = classes.length === 1 ? classes[0].members.find(node => ts.isMethodDeclaration(node) &&
    ts.isIdentifier(node.name) && node.name.text === "resolvedOptions") : undefined;
  const result = method?.body?.statements.at(-1);
  if (result === undefined || !ts.isReturnStatement(result) || !ts.isIdentifier(result.expression) || result.expression.text !== "opts")
    throw new TypeError("Unexpected plural engine resolved-options shape.");
  // Pass the already-rounded decimal text directly to the CLDR rule. Rebuilding
  // it from numeric fraction operands loses leading/trailing zeros and precision.
  const replacements = [
    { start: result.getStart(parsed), end: result.getStart(parsed),
      text: ["roundingIncrement", "roundingMode", "roundingPriority", "trailingZeroDisplay"]
        .map(field => `opts.${field} = internalSlots.${field};`).join("\n") + "\n" },
    { start: call.getStart(parsed), end: call.end, text: "PluralRuleSelect(locale, type, s, exponent)" },
    { start: selector.getStart(parsed), end: selector.end,
      text: 'function PluralRuleSelect(locale, type, formattedString, exponent) {\n  return PluralRules.localeData[locale].fn(formattedString, type === "ordinal", exponent);\n}' }
  ];
  for (const comment of ts.getLeadingCommentRanges(source, parsed.statements.at(-1)?.end ?? 0) ?? [])
    if (comment.kind === ts.SyntaxKind.SingleLineCommentTrivia && source.slice(comment.pos, comment.end).startsWith("//# sourceMappingURL="))
      replacements.push({ start: comment.pos, end: comment.end, text: "" });
  for (const replacement of replacements.sort((a, b) => b.start - a.start))
    source = source.slice(0, replacement.start) + replacement.text + source.slice(replacement.end);
  return `/*!\n${license}\n*/\n${source}`;
}

async function generate() {
  const packageDirectory = fileURLToPath(new URL("../", import.meta.url));
  const output = resolve(packageDirectory, "src/intl-data/dist");
  if (process.argv.includes("--copy")) {
    const destination = resolve(packageDirectory, "dist/intl-data/dist");
    await mkdir(destination, { recursive: true });
    for (const name of ["numberformat.js", "numberformat.d.ts", "numberformat-engine.js", "numberformat-engine.d.ts", "pluralrules.js", "pluralrules.d.ts", "pluralrules-engine.js", "pluralrules-engine.d.ts"])
      await copyFile(resolve(output, name), resolve(destination, name));
    return;
  }
  const require = createRequire(import.meta.url);
  const dataDirectory = resolve(dirname(require.resolve("@formatjs/intl-numberformat")), "locale-data");
  const values = [];
  for (const filename of (await readdir(dataDirectory)).filter(name => name.endsWith(".js")).sort())
    values.push(extractNumberFormatData(await readFile(resolve(dataDirectory, filename), "utf8"), filename));
  if (values.length === 0) throw new Error("Missing NumberFormat locale data.");
  await mkdir(output, { recursive: true });
  const license = await readFile(resolve(dataDirectory, "../LICENSE.md"), "utf8");
  const source = numberFormatDataModule(values, license);
  await writeFile(resolve(output, "numberformat.js"), source);
  await writeFile(resolve(output, "numberformat.d.ts"), 'import type { NumberFormat } from "@formatjs/intl-numberformat";\nexport declare const localeData: Readonly<Record<string, () => Parameters<typeof NumberFormat.__addLocaleData>[0]>>;\n');
  const engine = isolateNumberFormatEngine(await readFile(require.resolve("@formatjs/intl-numberformat"), "utf8"), license);
  await writeFile(resolve(output, "numberformat-engine.js"), engine);
  await writeFile(resolve(output, "numberformat-engine.d.ts"), 'export { NumberFormat } from "@formatjs/intl-numberformat";\n');
  const pluralDirectory = resolve(dirname(require.resolve("@formatjs/intl-pluralrules")), "locale-data");
  const pluralValues = [];
  for (const filename of (await readdir(pluralDirectory)).filter(name => name.endsWith(".js")).sort())
    pluralValues.push(extractPluralRulesData(await readFile(resolve(pluralDirectory, filename), "utf8"), filename));
  if (pluralValues.length === 0 || new Set(pluralValues.map(value => value.locale)).size !== pluralValues.length)
    throw new Error("Missing or duplicate plural locale data.");
  const pluralLicense = await readFile(resolve(pluralDirectory, "../LICENSE.md"), "utf8");
  if (pluralLicense.includes("*/")) throw new TypeError("Invalid plural locale license.");
  await writeFile(resolve(output, "pluralrules-engine.js"), isolatePluralRulesEngine(await readFile(require.resolve("@formatjs/intl-pluralrules"), "utf8"), pluralLicense));
  await writeFile(resolve(output, "pluralrules-engine.d.ts"), 'export { PluralRules } from "@formatjs/intl-pluralrules";\n');
  const pluralSource = `/*!\n${pluralLicense}\n*/\nexport const pluralData = Object.freeze({\n` +
    pluralValues.map(value => `${JSON.stringify(value.locale)}: () => (${value.expression})`).join(",\n") + "\n});\n";
  await writeFile(resolve(output, "pluralrules.js"), pluralSource);
  await writeFile(resolve(output, "pluralrules.d.ts"), 'import type { PluralRules } from "@formatjs/intl-pluralrules";\nexport declare const pluralData: Readonly<Record<string, () => Parameters<typeof PluralRules.__addLocaleData>[0]>>;\n');
  console.log(JSON.stringify({ numberFormatLocales: values.length, sourceBytes: Buffer.byteLength(source), pluralLocales: pluralValues.length }));
}

if (process.argv[1] !== undefined && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) await generate();
