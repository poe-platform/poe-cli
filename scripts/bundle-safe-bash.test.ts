import path from "node:path";
import { fileURLToPath } from "node:url";
import { createContext, runInContext } from "node:vm";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { Volume } from "memfs";
import { build, type OutputFile } from "esbuild";
import { beforeAll, expect, it } from "vitest";
import { resolveBrowserShellBuild } from "./bundle-safe-bash.mjs";
import { rewriteModuleSpecifiers } from "./package-safe.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function bundlePublicConsumer(outputs: readonly OutputFile[], contents: string) {
  const artifacts = new Volume();
  for (const output of outputs.filter(output => output.path.endsWith(".js"))) {
    artifacts.mkdirSync(path.dirname(output.path), { recursive: true });
    artifacts.writeFileSync(output.path, rewriteModuleSpecifiers(output.path, output.text, specifier =>
      specifier === "poe-code/safe-fs/core" ? "@poe-platform/safe-fs/core" : specifier));
  }
  const directory = path.join(root, "packages/safe-bash");
  const manifest = JSON.parse(await readFile(path.join(directory, "package.json"), "utf8"));
  const consumer = await build({
    stdin: { contents, resolveDir: root },
    bundle: true, write: false, platform: "node", format: "cjs", target: "es2022",
    external: ["@poe-platform/safe-fs/core"],
    plugins: [{
      name: "public-built-shell-entries",
      setup(builder) {
        builder.onResolve({ filter: /^@poe-platform\/safe-bash\// }, args => ({
          path: path.resolve(directory, manifest.exports["./" + args.path.split("/").at(-1)].import),
          namespace: "built-shell",
        }));
        builder.onResolve({ filter: /^\./, namespace: "built-shell" }, args => ({
          path: path.resolve(path.dirname(args.importer), args.path), namespace: "built-shell",
        }));
        builder.onLoad({ filter: /.*/, namespace: "built-shell" }, args => ({
          contents: artifacts.readFileSync(args.path, "utf8").toString(), loader: "js",
        }));
      },
    }],
  });
  return consumer.outputFiles![0]!.text;
}

it("runs nested env/xargs across public built browser and portable entries", async () => {
  const result = await build(resolveBrowserShellBuild(root));
  const consumer = await bundlePublicConsumer(result.outputFiles!, await readFile(path.join(root, "scripts/fixtures/safe-packages-mixed-entry-runtime.mjs"), "utf8"));
  const require = createRequire(import.meta.url);
  const sandbox = createContext({
    TextEncoder, TextDecoder, Uint8Array, ArrayBuffer, TransformStream, ReadableStream, WritableStream,
    AbortController, AbortSignal, setTimeout, clearTimeout, queueMicrotask, crypto: globalThis.crypto,
    require(name: string) {
      return name === "@poe-platform/safe-fs/core" ? filesystem : require(name);
    },
  });
  const publicConsumer = runInContext(`(function(){ const module = { exports: {} }; ${consumer}; return module.exports; })()`, sandbox);
  for (const entry of ["portable", "browser"]) {
    const { results, failures } = await publicConsumer.runNestedCommands(publicConsumer[entry]);
    for (const result of results) {
      expect(result, `${entry}: ${result.script}; internal errors: ${failures.join(", ")}`).toMatchObject({
        exitCode: 0, stdout: "2\n", stderr: "",
      });
    }
    expect(failures).toEqual([]);
  }
  expect(publicConsumer.browser.Shell).toBe(publicConsumer.portable.Shell);
  expect(publicConsumer.browser.ShellLimitError).toBe(publicConsumer.portable.ShellLimitError);
  expect(publicConsumer.browser.createCommandArguments).toBe(publicConsumer.portable.createCommandArguments);
  const argumentsFromBrowser = publicConsumer.browser.createCommandArguments(["nested"]);
  expect(publicConsumer.portable.getCommandArguments({ args: argumentsFromBrowser.args, argumentValues: argumentsFromBrowser })).toBe(argumentsFromBrowser);
  expect(() => publicConsumer.portable.getCommandArguments({ args: argumentsFromBrowser.args, argumentValues: { ...argumentsFromBrowser } })).toThrow("Expected owned command arguments");
  expect(() => publicConsumer.portable.getCommandArguments({ args: [...argumentsFromBrowser.args], argumentValues: argumentsFromBrowser })).toThrow(publicConsumer.browser.CommandArgumentIdentityError);
  const bytesFromBrowser = argumentsFromBrowser.withValues([new Uint8Array([255, 0])]);
  expect(Array.from(publicConsumer.portable.createCommandArguments(bytesFromBrowser.values).bytes(0))).toEqual([255, 0]);
});

it("builds the portable shell without Node workers, adapters, or duplicate filesystem identity", async () => {
  const options = resolveBrowserShellBuild(root);
  const result = await build(options);
  const outputs = result.metafile!.outputs;
  const pending = Object.keys(outputs).filter(filename => filename.endsWith("/browser.js"));
  const reachable = new Set<string>();
  while (pending.length) {
    const filename = pending.pop()!;
    if (reachable.has(filename)) continue;
    reachable.add(filename);
    for (const imported of outputs[filename]!.imports) {
      if (!imported.external) pending.push(imported.path);
    }
  }
  const inputs = [...new Set([...reachable].flatMap(filename => Object.keys(outputs[filename]!.inputs)))];
  expect(inputs.some(input => input.includes("shell/shell.ts"))).toBe(true);
  expect(inputs.some(input => input.includes("commands/filesystem.ts"))).toBe(true);
  expect(inputs.some(input => input.includes("fs/real/") || input.includes("transport/owner.ts"))).toBe(false);
  expect(inputs.some(input => input.includes("safe-fs/src"))).toBe(false);
  const imports = [...reachable].flatMap(filename => outputs[filename]!.imports);
  expect([...new Set(imports.filter(item => item.external).map(item => item.path))]).toEqual(["poe-code/safe-fs/core"]);
  expect(result.outputFiles!.some(output => output.path.endsWith("browser.js"))).toBe(true);
});

it("bundles the complete portable preset with one owned-argument identity", async () => {
  const options = resolveBrowserShellBuild(root);
  expect(options.entryPoints).toEqual(["browser", "portable"].map(entry => path.join(root, `packages/safe-bash/src/${entry}.ts`)));
  const result = await build(options);
  const allowed = ["node:crypto", "node:stream", "node:stream/promises", "node:zlib", "node:perf_hooks", "node:timers", "node:path"];
  const imports = Object.values(result.metafile!.outputs).flatMap(output => output.imports);
  for (const imported of imports.filter(item => item.external)) {
    expect(["poe-code/safe-fs/core", ...allowed]).toContain(imported.path);
  }
  const compiled = await bundlePublicConsumer(result.outputFiles!, 'export * from "@poe-platform/safe-bash/portable";');
  const require = createRequire(import.meta.url);
  const sandbox = createContext({
    TextEncoder, TextDecoder, Uint8Array, ArrayBuffer, TransformStream, ReadableStream, WritableStream,
    AbortController, AbortSignal, setTimeout, clearTimeout, queueMicrotask, crypto: globalThis.crypto,
    require(name: string) {
      if (name === "@poe-platform/safe-fs/core") return filesystem;
      expect(allowed).toContain(name);
      return require(name);
    },
  });
  const portable = runInContext(`(function(){ const module = { exports: {} }; ${compiled}; return module.exports; })()`, sandbox) as typeof import("../packages/safe-bash/src/portable.js");
  expect(portable.portableAgentCommandNames).toHaveLength(79);
  expect([...portable.portableAgentCommandNames].sort()).toEqual([
    "true", "false", "echo", "pwd", "basename", "dirname", "printf", "mkdir", "touch",
    "cp", "mv", "rm", "rmdir", "ln", "readlink", "realpath", "ls", "cat", "head", "tail",
    "wc", "tee", "tr", "sort", "uniq", "cut", "grep", "test", "[", "env", "xargs", "find",
    "sed", "awk", "jq", "rg", "base64", "base32", "xxd", "od", "sha256sum", "sha1sum",
    "md5sum", "cksum", "gzip", "gunzip", "zcat", "diff", "patch", "chmod", "stat", "mktemp", "tar",
    "paste", "comm", "join", "tac", "expand", "fold", "strings", "seq", "nl", "rev", "unexpand", "split",
    "date", "sleep", "printenv", "tree", "file", "egrep", "fgrep", "column", "html-to-markdown", "du", "expr", "which", "timeout", "apply_patch",
  ].sort());
  const commands = new portable.CommandRegistry();
  const plugin = portable.portableAgentCommands({ provider: portable.createBoundedRegexProvider() });
  try {
    await plugin.setup({ commands, use() {}, registerFileSystem() {} });
    expect(commands.list().map(command => command.name).sort()).toEqual([...portable.portableAgentCommandNames].sort());
  } finally { await plugin.dispose?.(); }
  const shell = new portable.Shell({ fs: new filesystem.MemoryFileSystem() }).use(
    portable.portableAgentCommands({ provider: portable.createBoundedRegexProvider() }),
  );
  try {
    for (const script of ["env jq -nc '1+1'", "printf '\"1+1\"' | xargs jq -nc"]) {
      const result = await shell.exec(script);
      expect(result.exitCode, result.stderr).toBe(0);
      expect(result.stdout).toBe("2\n");
      expect(result.stderr).toBe("");
    }
  } finally { await shell.dispose(); }
});

type BrowserShell = typeof import("../packages/safe-bash/src/browser.js");
type CoreFs = typeof import("../packages/safe-fs/src/core.js");
let browser: BrowserShell;
let filesystem: CoreFs;

beforeAll(async () => {
  const producer = await build({
    absWorkingDir: root,
    entryPoints: [path.join(root, "packages/safe-fs/src/core.ts")],
    bundle: true, write: false, platform: "browser", conditions: ["workerd", "worker", "browser"],
    format: "cjs", target: "es2022",
  });
  const consumer = await build(resolveBrowserShellBuild(root));
  const compiled = await bundlePublicConsumer(consumer.outputFiles!, 'export * from "@poe-platform/safe-bash/browser";');
  const sandbox = createContext({
    TextEncoder, TextDecoder, Uint8Array, ArrayBuffer, TransformStream, ReadableStream, WritableStream,
    AbortController, AbortSignal, setTimeout, clearTimeout, queueMicrotask, crypto: globalThis.crypto,
  });
  filesystem = runInContext(`(function(){ const module = { exports: {} }; ${producer.outputFiles![0]!.text}; return module.exports; })()`, sandbox) as CoreFs;
  sandbox.canonical = filesystem;
  browser = runInContext(`(function(){ const module = { exports: {} }; const require = name => { if (name !== "@poe-platform/safe-fs/core") throw new Error(name); return canonical; }; ${compiled}; return module.exports; })()`, sandbox) as BrowserShell;
  expect(runInContext("typeof Buffer + ':' + typeof process + ':' + typeof setImmediate", sandbox)).toBe("undefined:undefined:undefined");
});

it("runs filesystem pipelines with canonical identity and injected mounts", async () => {
  expect(browser.FsError).toBe(filesystem.FsError);
  expect(browser.MemoryFileSystem).toBe(filesystem.MemoryFileSystem);
  const source = new filesystem.MemoryFileSystem();
  const memory = new filesystem.MemoryFileSystem();
  await source.writeFile("/note", new TextEncoder().encode("hello\n"));
  const fs = filesystem.createMountFileSystem({ root: new filesystem.MemoryFileSystem(), mounts: {
    "/input": filesystem.createReadOnlyFileSystem(source), "/memory": memory,
  } });
  const shell = new browser.Shell({ fs }).use(browser.browserCommands());
  try {
    expect(browser.createBrowserCommands().map(command => command.name).sort()).toEqual([
      "[", "basename", "cat", "cp", "cut", "dirname", "echo", "false", "head", "ln", "ls", "mkdir", "mv", "printf",
      "pwd", "readlink", "realpath", "rm", "rmdir", "sort", "tail", "tee", "test", "touch", "tr", "true", "uniq", "wc",
    ]);
    expect((await shell.exec("cat /input/note | tr a-z A-Z")).stdout).toBe("HELLO\n");
    expect((await shell.exec("printf saved > /memory/state; cat /memory/state")).stdout).toBe("saved");
    expect(Array.from((await shell.exec("printf '\\377\\000'")).stdoutBytes)).toEqual([255, 0]);
    await fs.writeFile("/run.sh", new TextEncoder().encode("cat /memory/state"));
    expect((await shell.exec("sh /run.sh")).stdout).toBe("saved");
    expect((await shell.exec("printf forbidden > /input/note")).exitCode).not.toBe(0);
    const matched = await shell.exec("[[ abc123 =~ ^([a-z]+)([0-9]+)$ ]] && printf '%s:%s' \"${BASH_REMATCH[1]}\" \"${BASH_REMATCH[2]}\"");
    expect(matched.exitCode).toBe(0);
    expect(matched.stdout).toBe("abc:123");
    expect(matched.stderr).toBe("");
  } finally { await shell.dispose(); }
  await expect(shell.exec("echo closed")).rejects.toThrow();
});

it("rejects duplicate portable registration unless replacement is explicit", async () => {
  for (const replace of [false, true]) {
    const shell = new browser.Shell({ fs: new filesystem.MemoryFileSystem() })
      .use(browser.browserCommands()).use(browser.browserCommands({ replace }));
    try {
      if (replace) expect((await shell.exec("echo replaced")).stdout).toBe("replaced\n");
      else await expect(shell.exec("echo replaced")).rejects.toThrow("Command already registered");
    } finally { await shell.dispose(); }
  }
});

it("enforces command and output budgets in the portable runtime", async () => {
  for (const limits of [{ maxCommands: 1 }, { maxOutputBytes: 2 }]) {
    const shell = new browser.Shell({ fs: new filesystem.MemoryFileSystem(), limits }).use(browser.browserCommands());
    try { await expect(shell.exec("echo first; echo second")).rejects.toBeInstanceOf(browser.ShellLimitError); }
    finally { await shell.dispose(); }
  }
  const looping = new browser.Shell({ fs: new filesystem.MemoryFileSystem(), limits: { maxLoopIterations: 300 } });
  try { await expect(looping.exec("while :; do :; done")).rejects.toBeInstanceOf(browser.ShellLimitError); }
  finally { await looping.dispose(); }
});

it("enforces structural parse admission in the portable runtime", async () => {
  expect(browser.cloudflareWorkerLimits.maxParseUnits).toBe(65_536);
  expect(() => browser.parseShell(":", 0, { maxParseUnits: 0 })).toThrow(browser.ShellLimitError);
  expect(browser.parseShell(":", 0)).toEqual(browser.parseShell(":"));
  const shell = new browser.Shell({ fs: new filesystem.MemoryFileSystem(), limits: { maxParseUnits: 32 } });
  try {
    await expect(shell.exec(`: ${"w ".repeat(32)}`)).rejects.toMatchObject({ name: "ShellLimitError", limit: "maxParseUnits" });
    expect((await shell.exec(":")).exitCode).toBe(0);
  } finally { await shell.dispose(); }
});

it("cancels active custom commands and disposes the shell", async () => {
  const controller = new AbortController();
  let start!: () => void;
  const started = new Promise<void>(resolve => { start = resolve; });
  const shell = new browser.Shell({ fs: new filesystem.MemoryFileSystem() }).use({
    name: "wait-for-cancellation",
    setup(host) {
      host.commands.register({ name: "wait", execute(context) {
        return new Promise((_resolve, reject) => {
          context.signal.addEventListener("abort", () => reject(context.signal.reason), { once: true });
          start();
        });
      } });
    },
  });
  const stopped = new Error("stop browser execution");
  const running = shell.exec("wait", { signal: controller.signal });
  const rejected = expect(running).rejects.toBe(stopped);
  await started;
  controller.abort(stopped);
  await rejected;
  await shell.dispose();
});
