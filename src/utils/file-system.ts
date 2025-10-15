import type { Stats } from "node:fs";

export interface FileSystem {
  readFile(path: string, encoding: BufferEncoding): Promise<string>;
  readFile(path: string): Promise<Buffer>;
  writeFile(
    path: string,
    data: string | NodeJS.ArrayBufferView,
    options?: { encoding?: BufferEncoding }
  ): Promise<void>;
  mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
  stat(path: string): Promise<Stats>;
  rm?(
    path: string,
    options?: { recursive?: boolean; force?: boolean }
  ): Promise<void>;
  unlink(path: string): Promise<void>;
  readdir(path: string): Promise<string[]>;
  copyFile?(src: string, dest: string): Promise<void>;
}

export type PathExistsFn = (path: string) => Promise<boolean>;
