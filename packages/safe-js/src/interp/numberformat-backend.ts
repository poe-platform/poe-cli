import type { PortableFormatter, Options } from "./numberformat-portable.js";
import type { SandboxValue } from "./values.js";

const NativeNumberFormat = Intl.NumberFormat;
const modernNative = new NativeNumberFormat("en", { maximumFractionDigits: 0, ...{ roundingMode: "floor" } }).format(1.9) === "1" &&
  typeof Object.getOwnPropertyDescriptor(NativeNumberFormat.prototype, "formatRange")?.value === "function";
const portable = modernNative ? undefined : await import("./numberformat-portable.js");
type Formatter = Intl.NumberFormat | PortableFormatter;

export function createNumberFormatter(locales: string | string[], options: Options): Formatter {
  return portable === undefined ? new NativeNumberFormat(locales, options as Intl.NumberFormatOptions) : portable.createPortableNumberFormatter(locales, options);
}

export function numberFormatterOptions(formatter: Formatter): Options {
  return portable === undefined ? { ...formatter.resolvedOptions() } as Options : portable.numberFormatterOptions(formatter as PortableFormatter);
}

export function numberFormatterResult(formatter: Formatter, method: "format" | "formatToParts" | "formatRange" | "formatRangeToParts", values: Array<string | number | bigint>): SandboxValue {
  return portable === undefined ? Reflect.apply(Reflect.get(formatter, method), formatter, values)
    : portable.numberFormatterResult(formatter as PortableFormatter, method, values);
}
