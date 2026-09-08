import path from "node:path";
import { readFile } from "node:fs/promises";

export function resolveBrowserShellBuild(rootDir) {
  const directory = path.join(rootDir, "packages/safe-bash");
  const platform = path.join(directory, "browser/platform.mjs");
  const transport = path.join(directory, "src/commands/regex-execution/ere/transport/root.js");
  const builtins = ["node:crypto", "node:stream", "node:stream/promises", "node:zlib", "node:perf_hooks", "node:timers", "node:path"];
  return {
    absWorkingDir: rootDir,
    entryPoints: ["browser", "portable"].map(entry => path.join(directory, `src/${entry}.ts`)),
    outdir: path.join(directory, "dist"),
    splitting: true,
    chunkNames: "chunks/[name]-[hash]",
    bundle: true,
    platform: "browser",
    conditions: ["workerd", "worker", "browser"],
    format: "esm",
    target: "es2022",
    sourcemap: true,
    metafile: true,
    write: false,
    external: ["poe-code/safe-fs/core", ...builtins],
    alias: { "node:stream/web": platform },
    inject: [platform],
    plugins: [{
      name: "portable-shell-capabilities",
      setup(builder) {
        builder.onLoad({ filter: /.*/, namespace: "file" }, async args =>
          args.path === path.join(directory, "src/portable.ts")
            ? {
              contents: `${await readFile(args.path, "utf8")}\nexport { posix as posixPath } from "node:path";\n`,
              loader: "ts",
            }
            : undefined);
        builder.onResolve({ filter: /regex-execution\/ere\/transport\/root\.js$/ }, args =>
          path.resolve(args.resolveDir, args.path) === transport
            ? { path: path.join(directory, "browser/regex.mjs") }
            : undefined);
        builder.onResolve({ filter: /^node:/ }, args => {
          if (args.path === "node:stream/web" || args.path === "node:path" && args.importer === path.join(directory, "src/contracts/path.ts")) return { path: platform };
          if (builtins.includes(args.path)) return { path: args.path, external: true };
          return { errors: [{ text: `Node-only module in portable shell: ${args.path}` }] };
        });
      },
    }],
  };
}
