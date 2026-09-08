import path from "node:path";

export function resolveBrowserShellBuild(rootDir, entry = "browser") {
  if (entry !== "browser" && entry !== "portable") throw new Error(`Unknown portable shell entry: ${entry}`);
  const directory = path.join(rootDir, "packages/safe-bash");
  const platform = path.join(directory, "browser/platform.mjs");
  const transport = path.join(directory, "src/commands/regex-execution/ere/transport/root.js");
  const builtins = entry === "portable"
    ? ["node:crypto", "node:stream", "node:stream/promises", "node:zlib", "node:perf_hooks", "node:timers", "node:path"]
    : [];
  return {
    absWorkingDir: rootDir,
    entryPoints: [path.join(directory, `src/${entry}.ts`)],
    outfile: path.join(directory, `dist/${entry}.js`),
    bundle: true,
    platform: "browser",
    conditions: ["workerd", "worker", "browser"],
    format: "esm",
    target: "es2022",
    sourcemap: true,
    metafile: true,
    write: false,
    external: ["poe-code/safe-fs/core", ...builtins],
    alias: { "node:stream/web": platform, ...(entry === "browser" ? { "node:path": platform } : {}) },
    inject: [platform],
    plugins: [{
      name: "portable-shell-capabilities",
      setup(builder) {
        builder.onResolve({ filter: /regex-execution\/ere\/transport\/root\.js$/ }, args =>
          path.resolve(args.resolveDir, args.path) === transport
            ? { path: path.join(directory, "browser/regex.mjs") }
            : undefined);
        builder.onResolve({ filter: /^node:/ }, args => {
          if (args.path === "node:stream/web" || args.path === "node:path" && entry === "browser") return { path: platform };
          if (builtins.includes(args.path)) return { path: args.path, external: true };
          return { errors: [{ text: `Node-only module in ${entry} shell: ${args.path}` }] };
        });
      },
    }],
  };
}
