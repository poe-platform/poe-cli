import { types } from "node:util";
import type { Budget } from "./budget.js";
import type { SandboxObject } from "./values.js";

const readLength = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, "byteLength")!.get!;
const readResizable = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, "resizable")?.get;
const readMaxLength = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, "maxByteLength")?.get;
const readDetached = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, "detached")?.get;

export const arrayBufferPrototypes = new WeakMap<Budget, SandboxObject>();

export function isSandboxArrayBuffer(value: unknown): value is ArrayBuffer {
  return types.isArrayBuffer(value) && Object.getPrototypeOf(value) === ArrayBuffer.prototype;
}

export function arrayBufferLength(value: ArrayBuffer): number {
  return Reflect.apply(readLength, value, []) as number;
}

export function arrayBufferDetached(value: ArrayBuffer): boolean {
  if (readDetached !== undefined) return Reflect.apply(readDetached, value, []) as boolean;
  try {
    new Uint8Array(value, 0, 0);
    return false;
  } catch (error) {
    if (error instanceof TypeError) return true;
    throw error;
  }
}

export function arrayBufferOptions(value: ArrayBuffer): { maxByteLength: number } | undefined {
  return readResizable !== undefined && Reflect.apply(readResizable, value, [])
    ? { maxByteLength: Reflect.apply(readMaxLength!, value, []) as number } : undefined;
}

export function copyArrayBufferStorage(value: ArrayBuffer, state: { float32Buffers?: WeakMap<ArrayBuffer, ArrayBuffer> }): ArrayBuffer {
  state.float32Buffers ??= new WeakMap();
  let copy = state.float32Buffers.get(value);
  if (copy === undefined) {
    copy = Reflect.construct(ArrayBuffer, [arrayBufferLength(value), arrayBufferOptions(value)]) as ArrayBuffer;
    new Uint8Array(copy).set(new Uint8Array(value));
    state.float32Buffers.set(value, copy);
  }
  return copy;
}

export function arrayBufferDataProperties(value: ArrayBuffer): Array<[string | symbol, PropertyDescriptor]> {
  return Reflect.ownKeys(value).map(key => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (!("value" in descriptor)) throw new TypeError("ArrayBuffer accessors cannot be copied as data.");
    return [key, descriptor];
  });
}
