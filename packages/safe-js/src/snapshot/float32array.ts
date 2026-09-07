import { float32Properties, float32Storage, float32ViewLayouts, restoreFloat32View, isFloat32Array, isFloat32Index } from "../interp/float32.js";
import { getSandboxPrototype, hasExplicitSandboxPrototype } from "../interp/object-model.js";
import { restorePropertyDescriptors, serializePropertyDescriptors } from "./property-descriptors.js";
import type { GuestObjectState } from "./guest-heap.js";
import { arrayBufferDetached, arrayBufferOptions, isSandboxArrayBuffer } from "../interp/array-buffer.js";
import type { Budget } from "../interp/budget.js";

export function captureFloat32State<T>(value: Float32Array, encode: (value: unknown) => T): GuestObjectState<T> {
  const metadata = Object.defineProperties(Object.create(null), Object.fromEntries(float32Properties(value)));
  if (!Object.isExtensible(value)) Object.preventExtensions(metadata);
  return { properties: serializePropertyDescriptors(metadata, encode),
    ...(hasExplicitSandboxPrototype(value) ? { prototype: encode(getSandboxPrototype(value)) } : {}) };
}

export function restoreFloat32Properties<T>(value: Float32Array, state: GuestObjectState<T>, decode: (value: T) => unknown): void {
  const metadata = Object.create(null) as object;
  restorePropertyDescriptors(metadata, state.properties, decode);
  const descriptors = Object.getOwnPropertyDescriptors(metadata);
  if (Object.keys(descriptors).some(isFloat32Index)) throw new TypeError("Float32Array metadata cannot replace numeric storage.");
  Object.defineProperties(value, descriptors);
  if (!Object.isExtensible(metadata)) Object.preventExtensions(value);
}

export type Float32Data<TReference> = {
  kind: "float32array";
  byteOffset: number;
  length: number;
  lengthTracking?: true;
} & ({ bytes: number[] } | { buffer: TReference });

export function encodeFloat32Layout(value: Float32Array): { byteOffset: number; length: number; lengthTracking?: true } {
  const storage = float32Storage(value);
  if (arrayBufferDetached(storage.buffer)) return { byteOffset: 0, length: 0 };
  if (arrayBufferOptions(storage.buffer) === undefined) return { byteOffset: storage.byteOffset, length: storage.length };
  const layout = float32ViewLayouts.get(value);
  if (layout === undefined) throw new TypeError("Resizable Float32Array snapshots require known view layout.");
  return { byteOffset: layout.byteOffset, length: layout.length ?? 0,
    ...(layout.length === undefined ? { lengthTracking: true as const } : {}) };
}

export function encodeFloat32Storage<TReference>(
  value: Float32Array,
  id: number,
  buffers: WeakMap<ArrayBuffer, number>,
  reference: (id: number) => TReference
): Float32Data<TReference> {
  const storage = float32Storage(value);
  const existing = buffers.get(storage.buffer);
  if (existing === undefined) buffers.set(storage.buffer, id);
  return {
    kind: "float32array",
    byteOffset: storage.byteOffset,
    length: storage.length,
    ...(existing === undefined
      ? { bytes: Array.from(new Uint8Array(storage.buffer)) }
      : { buffer: reference(existing) })
  };
}

export function validateFloat32Storage(value: Record<string, unknown>): void {
  if (Object.hasOwn(value, "lengthTracking") && (value.lengthTracking !== true || value.length !== 0 || Object.hasOwn(value, "bytes")))
    throw new TypeError("Invalid Float32Array length-tracking layout.");
  if (
    !Number.isSafeInteger(value.length) ||
    Number(value.length) < 0 ||
    !Number.isSafeInteger(value.byteOffset) ||
    Number(value.byteOffset) < 0 ||
    Number(value.byteOffset) % 4 !== 0
  )
    throw new TypeError("Invalid Float32Array view dimensions.");
  if (Object.hasOwn(value, "bytes") === Object.hasOwn(value, "buffer"))
    throw new TypeError("Float32Array requires one backing storage description.");
  if (Object.hasOwn(value, "bytes")) {
    if (
      !Array.isArray(value.bytes) ||
      value.bytes.some((byte) => !Number.isInteger(byte) || byte < 0 || byte > 255) ||
      Number(value.length) > Math.floor((value.bytes.length - Number(value.byteOffset)) / 4)
    )
      throw new TypeError("Invalid Float32Array backing bytes.");
  }
}

export function decodeFloat32Storage(
  value: Record<string, unknown>,
  resolve: (reference: unknown) => unknown,
  budget?: Budget
): Float32Array {
  validateFloat32Storage(value);
  let buffer: ArrayBuffer;
  if (Array.isArray(value.bytes)) {
    buffer = new ArrayBuffer(value.bytes.length);
    new Uint8Array(buffer).set(value.bytes);
  } else {
    const referenced = resolve(value.buffer);
    if (isSandboxArrayBuffer(referenced)) buffer = referenced;
    else if (isFloat32Array(referenced)) buffer = float32Storage(referenced).buffer;
    else throw new TypeError("Invalid Float32Array backing reference.");
  }
  if (value.lengthTracking === true && arrayBufferOptions(buffer) === undefined)
    throw new TypeError("Length-tracking layout requires resizable backing storage.");
  return restoreFloat32View(buffer, Number(value.byteOffset), value.lengthTracking === true ? undefined : Number(value.length), budget);
}
