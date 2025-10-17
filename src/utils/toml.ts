import { parse, stringify } from "@iarna/toml";

export type TomlValue =
  | boolean
  | number
  | string
  | Date
  | TomlValue[]
  | TomlTable;

export interface TomlTable {
  [key: string]: TomlValue;
}

export function parseTomlDocument(content: string): TomlTable {
  const result = parse(content);
  if (!isPlainObject(result)) {
    throw new Error("Expected TOML document to be a table.");
  }
  return result;
}

export function serializeTomlDocument(table: TomlTable): string {
  const serialized = stringify(table as any);
  return serialized.endsWith("\n") ? serialized : `${serialized}\n`;
}

function isPlainObject(value: unknown): value is TomlTable {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}
