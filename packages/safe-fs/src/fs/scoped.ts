import type { FileReadHandle, FileResizeHandle, FileSystem, FsOptions, OpenResizeFileOptions, RenameOptions } from "../contracts/filesystem.js";
import { FsError } from "../contracts/errors.js";
import type { ByteSource } from "../contracts/io.js";
import { finishCleanup } from "../contracts/cleanup.js";
import { registerEntryView } from "./mount/comparison.js";
import { openRetainedResizeFile, retainedResizeCapabilities } from "./capabilities.js";

const originals = new WeakMap<FileSystem, FileSystem>();
const operations = new Set<keyof FileSystem>([
  "access", "appendFile", "canonicalizeMissingTarget", "capabilitiesFor", "chmod", "compareEntry",
  "copyFile", "link", "lstat", "mkdir", "openReadFile", "openResizeFile", "readFile", "readStream", "readdir",
  "readlink", "realpath", "rename", "resizeFile", "rm", "rmdir", "stat", "symlink", "truncate", "utimes",
  "writeFile", "writeStream",
]);

export function scopeFileSystem(filesystem: FileSystem, charge: () => void, signal: AbortSignal): FileSystem {
  const original = originals.get(filesystem) ?? filesystem;
  const methods = new Map<PropertyKey, { original: unknown; scoped: unknown }>();
  const assertOpen = (options?: FsOptions): void => {
    signal.throwIfAborted();
    options?.signal?.throwIfAborted();
  };
  const admit = (options?: FsOptions): void => {
    assertOpen(options);
    charge();
  };
  const wrapHandle = (handle: FileReadHandle): FileReadHandle => {
    let closed = false;
    const close = handle.close.bind(handle);
    return {
      async stat(options) { admit(options); return handle.stat(options); },
      async read(position, maxBytes, options) { admit(options); return handle.read(position, maxBytes, options); },
      get seekEnd() {
        const seek = handle.seekEnd;
        if (typeof seek !== "function") return undefined;
        return async (options: FsOptions = {}) => {
          assertOpen(options);
          if (closed) throw new FsError("EBADF");
          admit(options);
          assertOpen(options);
          if (closed) throw new FsError("EBADF");
          try {
            const result = await Reflect.apply(seek, handle, [resizeOptions(options)]);
            assertOpen(options);
            return result;
          } catch (error) { assertOpen(options); throw error; }
        };
      },
      close() { closed = true; return close(); },
    };
  };
  const resizeOptions = <Options extends FsOptions>(options: Options): Options => {
    const scopedOptions = {
      ...options, signal: options.signal ? AbortSignal.any([signal, options.signal]) : signal,
    };
    scopedOptions.signal.throwIfAborted();
    return scopedOptions;
  };
  const wrapResizeHandle = (handle: FileResizeHandle): FileResizeHandle => {
    let closing: Promise<void> | undefined;
    const admitOperation = (options: FsOptions): FsOptions => {
      assertOpen(options);
      if (closing) throw new FsError("EBADF");
      admit(options);
      assertOpen(options);
      if (closing) throw new FsError("EBADF");
      return resizeOptions(options);
    };
    return {
      async stat(options = {}) {
        try {
          const result = await handle.stat(admitOperation(options));
          assertOpen(options);
          return result;
        } catch (error) { assertOpen(options); throw error; }
      },
      async truncate(length, options = {}) {
        try {
          await handle.truncate(length, admitOperation(options));
          assertOpen(options);
        } catch (error) { assertOpen(options); throw error; }
      },
      get seekEnd() {
        const seek = handle.seekEnd;
        if (typeof seek !== "function") return undefined;
        return async (options: FsOptions = {}) => {
          try {
            const result = await Reflect.apply(seek, handle, [admitOperation(options)]);
            assertOpen(options);
            return result;
          } catch (error) { assertOpen(options); throw error; }
        };
      },
      close: () => closing ??= Promise.resolve().then(() => handle.close()),
    };
  };
  const wrapStream = (source: ByteSource, options?: FsOptions): ByteSource => ({
    [Symbol.asyncIterator]() {
      assertOpen(options);
      const iterator = source[Symbol.asyncIterator]();
      let closing: Promise<IteratorResult<Uint8Array>> | undefined;
      const close = (value?: unknown): Promise<IteratorResult<Uint8Array>> => closing ??= Promise.resolve().then(
        () => iterator.return ? iterator.return(value) : { done: true, value: undefined },
      );
      const advance = async (operation: () => Promise<IteratorResult<Uint8Array>>): Promise<IteratorResult<Uint8Array>> => {
        try {
          assertOpen(options);
          if (closing) { await closing; return { done: true, value: undefined }; }
          const result = await operation();
          assertOpen(options);
          if (closing) { await closing; return { done: true, value: undefined }; }
          return result;
        } catch (error) {
          await finishCleanup(close, true);
          throw error;
        }
      };
      return {
        next: () => advance(() => iterator.next()),
        return: close,
        ...(iterator.throw ? { throw: (error?: unknown) => advance(() => iterator.throw!(error)) } : {}),
      };
    },
  });
  const view = new Proxy(Object.create(original) as FileSystem, {
    set(_target, property, value) {
      return Reflect.set(original, property, value, original);
    },
    get(_target, property) {
      if (property === "capabilities") return retainedResizeCapabilities(original);
      const method: unknown = Reflect.get(original, property, original);
      if (typeof method !== "function") return method;
      const cached = methods.get(property);
      if (cached?.original === method) return cached.scoped;
      const dispatch = (...args: unknown[]): unknown => {
        if (operations.has(property as keyof FileSystem)) {
          const options = args.at(-1);
          admit(options && typeof options === "object" && "signal" in options ? options as FsOptions : undefined);
        }
        if (property === "compareEntry") {
          const peer = args[1] as FileSystem;
          args[1] = originals.get(peer) ?? peer;
        }
        if (property === "rename" && (args[2] as RenameOptions | undefined)?.noReplace) return (async () => {
          const options = args[2] as RenameOptions;
          const capabilities = await original.capabilitiesFor?.(args[1] as string, options) ?? original.capabilities;
          assertOpen(options);
          if (capabilities.atomicRenameNoReplace !== true) throw new FsError("ENOTSUP", {
            syscall: "rename", path: args[0] as string, dest: args[1] as string,
          });
          return Reflect.apply(method, original, args);
        })();
        return Reflect.apply(method, original, args);
      };
      const scoped = property === "openResizeFile"
        ? async (path: string, options: OpenResizeFileOptions = {}) => {
          admit(options);
          assertOpen(options);
          return wrapResizeHandle(await openRetainedResizeFile(original, path, resizeOptions(options)));
        }
        : property === "capabilitiesFor"
          ? async (...args: unknown[]) => retainedResizeCapabilities(original, await dispatch(...args) as FileSystem["capabilities"])
          : property === "openReadFile"
            ? async (...args: unknown[]) => wrapHandle(await dispatch(...args) as FileReadHandle)
            : property === "readStream"
              ? (...args: unknown[]) => wrapStream(dispatch(...args) as ByteSource, args[1] as FsOptions | undefined)
              : operations.has(property as keyof FileSystem) && property !== "canonicalizeMissingTarget"
                ? async (...args: unknown[]) => dispatch(...args)
                : dispatch;
      methods.set(property, { original: method, scoped });
      return scoped;
    },
  });
  originals.set(view, original);
  registerEntryView(view, async (path, options) => {
    assertOpen(options);
    return { filesystem: original, path };
  });
  return view;
}
