import path from "node:path";

export function resolveBrowserShellBuild(rootDir) {
  const directory = path.join(rootDir, "packages/safe-bash");
  const platform = path.join(directory, "browser/platform.mjs");
  const transport = path.join(directory, "src/commands/regex-execution/ere/transport/root.js");
  return {
    absWorkingDir: rootDir,
    entryPoints: {
      "core.browser": path.join(directory, "src/core.browser.ts"),
      "commands/xml/index.browser": path.join(directory, "src/commands/xml/index.ts"),
    },
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
    external: ["poe-code/safe-fs/core"],
    alias: { "node:stream/web": platform },
    inject: [platform],
    plugins: [{
      name: "portable-shell-capabilities",
      setup(builder) {
        builder.onResolve({ filter: /regex-execution\/ere\/transport\/root\.js$/ }, args =>
          path.resolve(args.resolveDir, args.path) === transport
            ? { path: path.join(directory, "browser/regex.mjs") }
            : undefined);
        builder.onResolve({ filter: /^node:/ }, args => {
          if (args.path === "node:stream/web" || args.path === "node:path" && args.importer === path.join(directory, "src/contracts/path.ts")) return { path: platform };
          return { errors: [{ text: `Node-only module in portable shell: ${args.path}` }] };
        });
      },
    }],
  };
}
