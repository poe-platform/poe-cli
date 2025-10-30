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
  if (!isTomlTable(result)) {
    throw new Error("Expected TOML document to be a table.");
  }
  return result;
}

export function serializeTomlDocument(table: TomlTable): string {
  const serialized = stringify(table as any);
  return serialized.endsWith("\n") ? serialized : `${serialized}\n`;
}

export function isTomlTable(value: unknown): value is TomlTable {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

export function mergeTomlTables(
  target: TomlTable,
  source: TomlTable
): TomlTable {
  const result: TomlTable = { ...target };
  for (const [key, value] of Object.entries(source)) {
    const current = result[key];
    if (isTomlTable(current) && isTomlTable(value)) {
      result[key] = mergeTomlTables(current, value);
      continue;
    }
    result[key] = value;
  }
  return result;
}
