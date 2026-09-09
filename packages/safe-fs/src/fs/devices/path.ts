import { FsError, isFsError } from "../../contracts/errors.js";
import type { FileStat, FileSystem, FsOptions } from "../../contracts/filesystem.js";
import { validatePath } from "../../contracts/virtual-path.js";

export const nullPath = "/dev/null";
export const deviceDirectory = "/dev";

export function lexicalDevicePath(path: string): string {
  validatePath(path);
  const parts: string[] = [];
  for (const component of path.split("/")) {
    if (`/${parts.join("/")}` === nullPath) throw new FsError("ENOTDIR", { path });
    if (component === "..") parts.pop();
    else if (component && component !== ".") parts.push(component);
  }
  return `/${parts.join("/")}`;
}

export async function resolveDevicePath(filesystem: FileSystem, path: string, options: FsOptions, followFinal = true): Promise<string> {
  options.signal?.throwIfAborted();
  const lexical = lexicalDevicePath(path);
  const aliases = typeof filesystem.lstat === "function";
  if (!aliases && lexical !== nullPath && lexical !== deviceDirectory && lexical !== "/") return lexical;
  const pending = path.split("/");
  const parts: string[] = [];
  let links = 0;
  let expanded = path.length;
  let absolute = path.startsWith("/");
  let traversalFailure: FsError | undefined;
  while (pending.length) {
    options.signal?.throwIfAborted();
    if (`/${parts.join("/")}` === nullPath) throw new FsError("ENOTDIR", { path });
    const component = pending.shift()!;
    if (!component || component === ".") continue;
    if (component === "..") { parts.pop(); continue; }
    const candidate = `/${[...parts, component].join("/")}`;
    if (candidate !== deviceDirectory && candidate !== nullPath && ((followFinal && aliases) || pending.length)) {
      const lookup = absolute ? candidate : candidate.slice(1);
      let stat: FileStat | undefined;
      try {
        if (typeof filesystem.lstat !== "function") throw new FsError("ENOTSUP", { path });
        stat = await filesystem.lstat(lookup, options);
      } catch (error) {
        options.signal?.throwIfAborted();
        if (isFsError(error, "ENOTSUP") && links === 0 && lexical !== nullPath && lexical !== deviceDirectory && lexical !== "/") return lexical;
        if (!isFsError(error, "ENOENT")) throw error;
        if (pending.length) traversalFailure ??= error;
      }
      options.signal?.throwIfAborted();
      if (stat?.type === "symlink") {
        if (typeof filesystem.readlink !== "function") throw new FsError("ENOTSUP", { path });
        if (++links > 40) throw new FsError("ELOOP", { path });
        const target = await filesystem.readlink(lookup, options);
        options.signal?.throwIfAborted();
        validatePath(target);
        expanded += target.length;
        if (expanded > 65536) throw new FsError("ENAMETOOLONG", { path });
        if (target.startsWith("/")) { parts.length = 0; absolute = true; }
        pending.unshift(...target.split("/"));
        continue;
      }
      if (stat && pending.length && stat.type !== "directory") traversalFailure ??= new FsError("ENOTDIR", { path });
    }
    parts.push(component);
  }
  const resolved = `/${parts.join("/")}`;
  if (traversalFailure && (resolved === nullPath || resolved === deviceDirectory || resolved === "/")) throw traversalFailure;
  return resolved;
}
