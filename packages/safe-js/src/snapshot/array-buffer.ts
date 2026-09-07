import { arrayBufferLength, arrayBufferOptions, isSandboxArrayBuffer } from "../interp/array-buffer.js";
import { float32Storage, isFloat32Array } from "../interp/float32.js";
import { getSandboxPrototype, hasExplicitSandboxPrototype } from "../interp/object-model.js";
import { serializePropertyDescriptors } from "./property-descriptors.js";
import type { GuestObjectState } from "./guest-heap.js";

export type ArrayBufferData<TReference> = { kind: "arraybuffer" } & ({ bytes: number[]; maxByteLength?: number } | { buffer: TReference });

export function captureArrayBufferState<T>(value: ArrayBuffer, encode: (value: unknown) => T): GuestObjectState<T> {
  return { properties: serializePropertyDescriptors(value, encode),
    ...(hasExplicitSandboxPrototype(value) ? { prototype: encode(getSandboxPrototype(value)) } : {}) };
}

export function encodeArrayBufferStorage<T>(value: ArrayBuffer, id: number, buffers: WeakMap<ArrayBuffer, number>, reference: (id: number) => T): ArrayBufferData<T> {
  arrayBufferLength(value);
  const existing = buffers.get(value);
  if (existing === undefined) buffers.set(value, id);
  return { kind: "arraybuffer", ...(existing === undefined ? { bytes: Array.from(new Uint8Array(value)), ...arrayBufferOptions(value) } : { buffer: reference(existing) }) };
}

export function validateArrayBufferStorage(value: Record<string, unknown>): void {
  if (Object.hasOwn(value, "bytes") === Object.hasOwn(value, "buffer"))
    throw new TypeError("ArrayBuffer requires one backing storage description.");
  if (Object.hasOwn(value, "bytes") && (!Array.isArray(value.bytes) ||
      value.bytes.some(byte => !Number.isInteger(byte) || byte < 0 || byte > 255)))
    throw new TypeError("Invalid ArrayBuffer bytes.");
  if (Object.hasOwn(value, "maxByteLength") && (!Array.isArray(value.bytes) ||
      !Number.isSafeInteger(value.maxByteLength) || Number(value.maxByteLength) < value.bytes.length))
    throw new TypeError("Invalid ArrayBuffer maximum length.");
}

export function decodeArrayBufferStorage(value: Record<string, unknown>, resolve: (reference: unknown) => unknown): ArrayBuffer {
  validateArrayBufferStorage(value);
  if (Array.isArray(value.bytes)) {
    const buffer = Reflect.construct(ArrayBuffer, [value.bytes.length,
      Object.hasOwn(value, "maxByteLength") ? { maxByteLength: value.maxByteLength } : undefined]) as ArrayBuffer;
    new Uint8Array(buffer).set(value.bytes);
    return buffer;
  }
  const referenced = resolve(value.buffer);
  if (isSandboxArrayBuffer(referenced)) return referenced;
  if (isFloat32Array(referenced)) return float32Storage(referenced).buffer;
  throw new TypeError("Invalid ArrayBuffer backing reference.");
}
