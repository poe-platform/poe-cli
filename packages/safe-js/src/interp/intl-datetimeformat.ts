import type { SandboxClosure, SandboxObject, SandboxValue } from "./values.js";

const NativeDateTimeFormat = Intl.DateTimeFormat;
const resolvedOptions = NativeDateTimeFormat.prototype.resolvedOptions;
const format = Object.getOwnPropertyDescriptor(NativeDateTimeFormat.prototype, "format")!.get!;
const methods = {
  formatToParts: NativeDateTimeFormat.prototype.formatToParts,
  formatRange: NativeDateTimeFormat.prototype.formatRange,
  formatRangeToParts: NativeDateTimeFormat.prototype.formatRangeToParts
};
export type DateTimeFormatOptions = Record<string, string | number | boolean>;
const states = new WeakMap<object, { native: Intl.DateTimeFormat; options: DateTimeFormatOptions; format?: SandboxClosure }>();

export function createSandboxDateTimeFormat(locales: string | string[], options: DateTimeFormatOptions, restoring = false): SandboxObject {
  const input = { ...options };
  // Resolved hour12 is derived from hourCycle. Reapplying it as a caller option
  // overrides the saved cycle with the locale's default h12/h23 alternative.
  if (restoring) delete input.hour12;
  const native = new NativeDateTimeFormat(locales, input);
  const value = Object.create(null) as SandboxObject;
  states.set(value, { native, options: { ...Reflect.apply(resolvedOptions, native, []) } });
  return value;
}

export function isSandboxDateTimeFormat(value: unknown): value is SandboxObject {
  return typeof value === "object" && value !== null && states.has(value);
}

export function dateTimeFormatState(value: unknown) {
  if (!isSandboxDateTimeFormat(value)) throw new TypeError("Intl.DateTimeFormat requires a DateTimeFormat receiver.");
  return states.get(value)!;
}

export function formatDateTimeValue(receiver: unknown, method: "format" | keyof typeof methods, values: number[]): SandboxValue {
  const { native } = dateTimeFormatState(receiver);
  return method === "format" ? Reflect.apply(format, native, [])(values[0]) : Reflect.apply(methods[method], native, values);
}
