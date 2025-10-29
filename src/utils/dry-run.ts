import { Buffer } from "node:buffer";
import type { FileSystem } from "./file-system.js";

export type DryRunOperation =
  | {
      type: "writeFile";
      path: string;
      nextContent: string;
      previousContent: string | null;
    }
  | {
      type: "mkdir";
      path: string;
      options?: { recursive?: boolean };
    }
  | {
      type: "unlink";
      path: string;
    }
  | {
      type: "rm";
      path: string;
      options?: { recursive?: boolean; force?: boolean };
    }
  | {
      type: "copyFile";
      from: string;
      to: string;
    };

export class DryRunRecorder {
  private operations: DryRunOperation[] = [];

  record(operation: DryRunOperation): void {
    this.operations.push(operation);
  }

  drain(): DryRunOperation[] {
    const snapshot = this.operations;
    this.operations = [];
    return snapshot;
  }
}

export function createDryRunFileSystem(
  base: FileSystem,
  recorder: DryRunRecorder
): FileSystem {
  const proxy: Partial<FileSystem> = {
    async readFile(path: string, encoding?: BufferEncoding): Promise<any> {
      if (encoding) {
        return base.readFile(path, encoding);
      }
      return base.readFile(path);
    },
    async writeFile(
      path: string,
      data: string | NodeJS.ArrayBufferView,
      options?: { encoding?: BufferEncoding }
    ): Promise<void> {
      const previousContent = await tryReadText(base, path);
      const nextContent = formatData(data, options?.encoding);
      recorder.record({
        type: "writeFile",
        path,
        nextContent,
        previousContent
      });
    },
    async mkdir(
      path: string,
      options?: { recursive?: boolean }
    ): Promise<void> {
      recorder.record({ type: "mkdir", path, options });
    },
    async stat(path: string) {
      return base.stat(path);
    },
    async unlink(path: string): Promise<void> {
      recorder.record({ type: "unlink", path });
    },
    async readdir(path: string): Promise<string[]> {
      return base.readdir(path);
    }
  };

  if (typeof base.rm === "function") {
    proxy.rm = async (
      path: string,
      options?: { recursive?: boolean; force?: boolean }
    ): Promise<void> => {
      recorder.record({ type: "rm", path, options });
    };
  }

  if (typeof base.copyFile === "function") {
    proxy.copyFile = async (from: string, to: string) => {
      recorder.record({ type: "copyFile", from, to });
    };
  }

  return proxy as FileSystem;
}

export function formatDryRunOperations(
  operations: DryRunOperation[]
): string[] {
  if (operations.length === 0) {
    return ["  • no file changes recorded"];
  }

  return operations.flatMap((op) => formatOperation(op));
}

function formatOperation(operation: DryRunOperation): string[] {
  switch (operation.type) {
    case "mkdir": {
      const recursiveFlag = operation.options?.recursive ? " (recursive)" : "";
      return [`- mkdir ${operation.path}${recursiveFlag}`];
    }
    case "unlink":
      return [`- delete ${operation.path}`];
    case "rm": {
      const flags: string[] = [];
      if (operation.options?.recursive) {
        flags.push("recursive");
      }
      if (operation.options?.force) {
        flags.push("force");
      }
      const flagSuffix = flags.length > 0 ? ` (${flags.join(", ")})` : "";
      return [`- remove ${operation.path}${flagSuffix}`];
    }
    case "copyFile":
      return [`- copy ${operation.from} -> ${operation.to}`];
    case "writeFile": {
      const status = describeWriteChange(
        operation.previousContent,
        operation.nextContent
      );
      return [`- write ${operation.path}${status}`];
    }
    default: {
      const neverOp: never = operation;
      return [`- unknown operation ${(neverOp as any).type}`];
    }
  }
}

function describeWriteChange(
  previous: string | null,
  next: string
): string {
  if (previous == null) {
    return " (create)";
  }
  if (previous === next) {
    return " (no changes)";
  }
  return " (update)";
}

async function tryReadText(
  base: FileSystem,
  path: string
): Promise<string | null> {
  try {
    return await base.readFile(path, "utf8");
  } catch (error) {
    if (isNotFound(error)) {
      return null;
    }
    return null;
  }
}

function formatData(
  data: string | NodeJS.ArrayBufferView,
  encoding: BufferEncoding = "utf8"
): string {
  if (typeof data === "string") {
    return data;
  }

  try {
    const buffer = bufferFromView(data);
    return buffer.toString(encoding);
  } catch {
    return `<binary data (${data.byteLength} bytes)>`;
  }
}

function bufferFromView(view: NodeJS.ArrayBufferView): Buffer {
  return Buffer.from(view.buffer, view.byteOffset, view.byteLength);
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "ENOENT"
  );
}
