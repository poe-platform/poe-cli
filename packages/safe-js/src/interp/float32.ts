import type { Budget } from "./budget.js";
import { arrayBufferLength, arrayBufferOptions, copyArrayBufferStorage } from "./array-buffer.js";

const typedArrayPrototype = Object.getPrototypeOf(Float32Array.prototype);
const readLength = Object.getOwnPropertyDescriptor(typedArrayPrototype, "length")!.get!;
const readOffset = Object.getOwnPropertyDescriptor(typedArrayPrototype, "byteOffset")!.get!;
const readBuffer = Object.getOwnPropertyDescriptor(typedArrayPrototype, "buffer")!.get!;
const readTag = Object.getOwnPropertyDescriptor(typedArrayPrototype, Symbol.toStringTag)!.get!;
const createValuesIterator = Object.getOwnPropertyDescriptor(typedArrayPrototype, "values")!.value;
const bufferLength = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, "byteLength")!.get!;
const bufferResizable = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, "resizable")?.get;
export const float32ViewLayouts = new WeakMap<Float32Array, { byteOffset: number; length?: number }>();
const resizeBuffer = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, "resize")?.value as ((length: number) => void) | undefined;

export function restoreFloat32View(buffer: ArrayBuffer, byteOffset: number, length?: number, budget?: Budget): Float32Array {
  const originalLength = arrayBufferLength(buffer);
  const required = byteOffset + (length ?? 0) * 4;
  const options = arrayBufferOptions(buffer);
  const grow = required > originalLength;
  if (grow) {
    if (resizeBuffer === undefined || options === undefined || required > options.maxByteLength)
      throw new RangeError("Float32Array layout exceeds backing capacity.");
    budget?.allocateArrayLength(Math.ceil(required / 4));
    budget?.provisionDataUsage(required - originalLength)();
    Reflect.apply(resizeBuffer, buffer, [required]);
  }
  try {
    const view = new Float32Array(buffer, byteOffset, length);
    if (options !== undefined) float32ViewLayouts.set(view, { byteOffset, ...(length === undefined ? {} : { length }) });
    return view;
  } finally {
    if (grow) Reflect.apply(resizeBuffer!, buffer, [originalLength]);
  }
}

export function isFloat32Array(value: unknown): value is Float32Array {
  return (
    ArrayBuffer.isView(value) &&
    Object.getPrototypeOf(value) === Float32Array.prototype &&
    Reflect.apply(readTag, value, []) === "Float32Array"
  );
}

export function float32Storage(value: Float32Array, requireInBounds = false): {
  buffer: ArrayBuffer;
  byteOffset: number;
  length: number;
  byteLength: number;
} {
  if (requireInBounds) Reflect.apply(createValuesIterator, value, []);
  const buffer = Reflect.apply(readBuffer, value, []) as ArrayBuffer;
  if (
    Object.getPrototypeOf(buffer) !== ArrayBuffer.prototype
  ) {
    throw new TypeError("Float32Array requires a non-shared ArrayBuffer.");
  }
  return {
    buffer,
    byteOffset: Reflect.apply(readOffset, value, []) as number,
    length: Reflect.apply(readLength, value, []) as number,
    byteLength: Reflect.apply(bufferLength, buffer, []) as number
  };
}

export function float32Properties(value: Float32Array): Array<[PropertyKey, PropertyDescriptor]> {
  const properties: Array<[PropertyKey, PropertyDescriptor]> = [];
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key === "string" && isFloat32Index(key)) continue;
    properties.push([key, Object.getOwnPropertyDescriptor(value, key)!]);
  }
  return properties;
}

export function float32DataProperties(value: Float32Array): Array<[string, PropertyDescriptor]> {
  if (Object.getOwnPropertySymbols(value).length > 0)
    throw new TypeError("Float32Array symbol properties are not supported.");
  const properties: Array<[string, PropertyDescriptor]> = [];
  for (const [key, descriptor] of float32Properties(value)) {
    if (typeof key !== "string") throw new TypeError("Float32Array symbol properties are not supported.");
    if (!("value" in descriptor))
      throw new TypeError(`Float32Array accessor property '${key}' is not supported.`);
    properties.push([key, descriptor]);
  }
  return properties;
}

export function isFloat32Index(key: string): boolean {
  return key === "-0" || String(Number(key)) === key;
}

export function float32Number(value: unknown): number {
  if (
    (value !== null && typeof value === "object") ||
    typeof value === "function" ||
    typeof value === "symbol" ||
    typeof value === "bigint"
  ) {
    throw new TypeError(
      "Float32Array numeric arguments must be primitive numeric-coercible values."
    );
  }
  return Number(value);
}

export function checkFloat32Allocation(length: number, budget: Budget): void {
  budget.allocateArrayLength(length);
  budget.provisionDataUsage(length * Float32Array.BYTES_PER_ELEMENT + 1)();
}

export function copyFloat32Storage<TValue>(
  value: Float32Array,
  state: {
    seen: WeakMap<object, TValue>;
    float32Buffers?: WeakMap<ArrayBuffer, ArrayBuffer>;
  }
): Float32Array {
  const storage = float32Storage(value);
  const buffer = copyArrayBufferStorage(storage.buffer, state);
  if (bufferResizable !== undefined && Reflect.apply(bufferResizable, storage.buffer, [])) {
    const layout = float32ViewLayouts.get(value);
    if (layout === undefined) throw new TypeError("Resizable Float32Array copies require known view layout.");
    return restoreFloat32View(buffer, layout.byteOffset, layout.length);
  }
  return new Float32Array(buffer, storage.byteOffset, storage.length);
}
