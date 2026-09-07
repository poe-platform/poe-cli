import type { Budget } from "../budget.js";
import {
  checkFloat32Allocation,
  float32Number,
  float32Storage,
  isFloat32Array,
  isFloat32Index
} from "../float32.js";
import { createSandboxClosure, type SandboxClosure, type SandboxObject, type SandboxValue } from "../values.js";
import { accessorAdapter } from "../accessors.js";
import { float32Prototypes } from "../float32-prototypes.js";
import { getSandboxDataProperty, getSandboxPropertyDescriptor, getSandboxPrototype, materializeFunctionProperties, registerIntrinsicFunction, registerIntrinsicObject, setSandboxPrototype } from "../object-model.js";
import { registerBuiltinIdentities, resolveIntrinsicIdentity } from "../intrinsics.js";
import { invokeBuiltinClosure } from "../builtin-call.js";
import { retainValues } from "../resources.js";
import { sandboxString } from "../string-coercion.js";

const constructors = new WeakSet<SandboxClosure>();

export function createFloat32ArrayGlobal(budget: Budget, nativePrototype = false): SandboxClosure {
  const constructor = createSandboxClosure({
    guest: nativePrototype,
    sandbox: true,
    name: "Float32Array",
    length: 3,
    properties: { BYTES_PER_ELEMENT: 4 },
    call: () => {
      throw new TypeError("Constructor Float32Array requires 'new'.");
    },
    construct: (args, context) => {
      if (!nativePrototype) return allocateFloat32Array(args[0], budget);
      return (async () => {
        const newTarget = context?.newTarget ?? constructor;
        const candidate = context?.getProperty === undefined
          ? getSandboxDataProperty(newTarget, "prototype", budget)
          : await context.getProperty(newTarget, "prototype");
        const prototype = candidate !== null && typeof candidate === "object" ? candidate : float32Prototypes.get(budget)!;
        const release = retainValues(budget, () => [prototype, ...args]);
        try {
          const result = allocateFloat32Array(args[0], budget);
          setSandboxPrototype(result, prototype, budget);
          return result;
        } finally { release(); }
      })();
    }
  });
  constructors.add(constructor);
  return constructor;
}

function allocateFloat32Array(source: SandboxValue, budget: Budget): Float32Array {
      if (Array.isArray(source) || isFloat32Array(source)) {
        const length = isFloat32Array(source) ? float32Storage(source).length : source.length;
        checkFloat32Allocation(length, budget);
        if (isFloat32Array(source)) return new Float32Array(source);
        const result = new Float32Array(length);
        for (let index = 0; index < length; index += 1) {
          budget.visitNode();
          const descriptor = Object.getOwnPropertyDescriptor(source, index);
          if (descriptor !== undefined && !("value" in descriptor))
            throw new TypeError("Float32Array input accessors are not supported.");
          result[index] = float32Number(descriptor?.value);
        }
        return result;
      }
      const number = float32Number(source);
      const length = Number.isNaN(number) ? 0 : Math.trunc(number);
      if (length < 0 || !Number.isSafeInteger(length))
        throw new RangeError("Invalid typed array length.");
      checkFloat32Allocation(length, budget);
      return new Float32Array(length);
}

export function createFloat32ArrayPrototypes(budget: Budget, constructor: SandboxClosure): void {
  const prototype = Object.create(null) as SandboxObject;
  const shared = Object.create(null) as SandboxObject;
  const abstractCall = () => { throw new TypeError("Abstract TypedArray constructor cannot be called."); };
  const typedArray = createSandboxClosure({ guest: true, sandbox: true, name: "TypedArray", length: 0,
    call: abstractCall, construct: abstractCall });
  Object.defineProperty(materializeFunctionProperties(typedArray), "prototype", { value: shared, writable: false });
  Object.defineProperties(materializeFunctionProperties(constructor), {
    prototype: { value: prototype, writable: false },
    BYTES_PER_ELEMENT: { value: 4, writable: false, enumerable: false, configurable: false }
  });
  Object.defineProperties(prototype, {
    constructor: { value: constructor, writable: true, configurable: true },
    BYTES_PER_ELEMENT: { value: 4 }
  });
  Object.defineProperty(shared, "constructor", { value: typedArray, writable: true, configurable: true });
  setSandboxPrototype(constructor, typedArray);
  setSandboxPrototype(prototype, shared);
  setSandboxPrototype(shared, getSandboxPrototype(Object.create(null), budget));
  const getters: SandboxClosure[] = [];
  for (const key of ["length", "byteLength", "byteOffset"] as const) {
    const getter = createSandboxClosure({ guest: true, sandbox: true, name: `get ${key}`, length: 0,
      call: (_args, context) => {
        if (!isFloat32Array(context?.thisValue)) throw new TypeError(`TypedArray ${key} requires a typed array receiver.`);
        const storage = float32Storage(context.thisValue);
        return key === "byteLength" ? storage.length * 4 : storage[key];
      }
    });
    getters.push(getter);
    Object.defineProperty(shared, key, { get: accessorAdapter(getter, "get"), configurable: true });
  }
  for (const key of ["set", "slice", "subarray"])
    Object.defineProperty(shared, key, { value: getFloat32Member(new Float32Array(0), key, budget), writable: true, configurable: true });
  const arrayPrototype = resolveIntrinsicIdentity(budget, '["Array","prototype"]') as SandboxObject;
  Object.defineProperty(shared, "toString", { value: getSandboxDataProperty(arrayPrototype, "toString", budget), writable: true, configurable: true });
  Object.defineProperty(shared, "join", { writable: true, configurable: true,
    value: createSandboxClosure({ guest: true, sandbox: true, name: "join", length: 1,
      call: async (args, context) => {
        if (!isFloat32Array(context?.thisValue)) throw new TypeError("TypedArray join requires a typed array receiver.");
        const receiver = context.thisValue;
        const length = float32Storage(receiver).length;
        let separator = ",";
        let text = "";
        const release = retainValues(budget, () => [receiver, separator, text, ...args]);
        try {
          if (args[0] !== undefined) separator = await sandboxString(args[0], budget, context);
          for (let index = 0; index < length; index++) {
            budget.visitNode();
            text = budget.allocateString(text + (index === 0 ? "" : separator) + String(receiver[index]));
          }
          return text;
        } finally { release(); }
      }
    })
  });
  const tagGetter = createSandboxClosure({ guest: true, sandbox: true, name: "get [Symbol.toStringTag]", length: 0,
    call: (_args, context) => isFloat32Array(context?.thisValue) ? "Float32Array" : undefined });
  getters.push(tagGetter);
  Object.defineProperty(shared, Symbol.toStringTag, { get: accessorAdapter(tagGetter, "get"), configurable: true });
  for (const key of ["values", "keys", "entries"] as const) {
    const method = getSandboxDataProperty(arrayPrototype, key, budget) as SandboxClosure;
    const closure = createSandboxClosure({ guest: true, sandbox: true, name: key, length: 0,
      call: (args, context) => {
        if (!isFloat32Array(context?.thisValue)) throw new TypeError(`TypedArray ${key} requires a typed array receiver.`);
        return invokeBuiltinClosure(method, args, budget, context, context.thisValue);
      }
    });
    Object.defineProperty(shared, key, { value: closure, writable: true, configurable: true });
    if (key === "values") Object.defineProperty(shared, Symbol.iterator, { value: closure, writable: true, configurable: true });
  }
  float32Prototypes.set(budget, prototype);
  registerBuiltinIdentities(budget, { Float32Array: constructor, "%TypedArray%": typedArray });
  registerIntrinsicFunction(budget, constructor);
  registerIntrinsicFunction(budget, typedArray);
  registerIntrinsicObject(budget, prototype);
  registerIntrinsicObject(budget, shared);
  for (const getter of getters) registerIntrinsicFunction(budget, getter);
}

export function isFloat32ArrayConstructor(value: unknown): boolean {
  return typeof value === "object" && value !== null && constructors.has(value as SandboxClosure);
}

export function getFloat32Member(
  value: Float32Array,
  property: string | number,
  budget: Budget
): SandboxValue {
  const key = String(property);
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (descriptor !== undefined) {
    if (!("value" in descriptor)) throw new TypeError("Float32Array accessors are not supported.");
    return descriptor.value;
  }
  if (float32Prototypes.has(budget)) return undefined;
  const storage = float32Storage(value);
  if (key === "length") return storage.length;
  if (key === "byteLength") return storage.length * 4;
  if (key === "byteOffset") return storage.byteOffset;
  if (key === "BYTES_PER_ELEMENT") return 4;
  if (!["set", "slice", "subarray"].includes(key)) return undefined;
  return createSandboxClosure({
    guest: true,
    sandbox: true,
    name: key,
    length: key === "set" ? 1 : 2,
    call: (args, context) => {
      const receiver = context?.thisValue;
      if (!isFloat32Array(receiver))
        throw new TypeError(`Float32Array#${key} requires a Float32Array receiver.`);
      const storage = float32Storage(receiver);
      if (key === "set") {
        const [source, offsetValue = 0] = args;
        if (!Array.isArray(source) && !isFloat32Array(source))
          throw new TypeError("Float32Array#set requires an array or Float32Array.");
        const number = float32Number(offsetValue);
        const offset = Number.isNaN(number) ? 0 : Math.trunc(number);
        const length = isFloat32Array(source) ? float32Storage(source).length : source.length;
        if (offset < 0 || !Number.isSafeInteger(offset) || offset + length > storage.length)
          throw new RangeError("Float32Array#set source is out of bounds.");
        if (isFloat32Array(source)) {
          Float32Array.prototype.set.call(receiver, source, offset);
          return undefined;
        }
        checkFloat32Allocation(length, budget);
        const copied = new Float32Array(length);
        for (let index = 0; index < length; index += 1) {
          budget.visitNode();
          const entry = Object.getOwnPropertyDescriptor(source, index);
          if (entry !== undefined && !("value" in entry))
            throw new TypeError("Float32Array input accessors are not supported.");
          copied[index] = float32Number(entry?.value);
        }
        Float32Array.prototype.set.call(receiver, copied, offset);
        return undefined;
      }
      const start = relativeIndex(args[0], storage.length, 0);
      const end = relativeIndex(args[1], storage.length, storage.length);
      const length = Math.max(end - start, 0);
      if (key === "subarray")
        return new Float32Array(storage.buffer, storage.byteOffset + start * 4, length);
      checkFloat32Allocation(length, budget);
      const result = new Float32Array(length);
      new Uint8Array(result.buffer).set(
        new Uint8Array(storage.buffer, storage.byteOffset + start * 4, length * 4)
      );
      return result;
    }
  });
}

export function setFloat32Member(
  value: Float32Array,
  property: PropertyKey,
  entry: SandboxValue,
  budget?: Budget
): void {
  const key = typeof property === "symbol" ? property : String(property);
  if (typeof key !== "symbol" && isFloat32Index(key)) {
    Reflect.set(value, key, float32Number(entry));
    return;
  }
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  const inherited = descriptor ?? (budget === undefined ? undefined : getSandboxPropertyDescriptor(value, key, budget));
  if (
    descriptor === undefined && typeof key === "string" &&
    (budget === undefined || !float32Prototypes.has(budget)) &&
    ["length", "byteLength", "byteOffset", "buffer", "BYTES_PER_ELEMENT"].includes(key)
  )
    throw new TypeError(`Cannot assign to read only property '${String(key)}'.`);
  if (inherited !== undefined && (!("value" in inherited) || !inherited.writable))
    throw new TypeError(`Cannot assign to read only property '${String(key)}'.`);
  Object.defineProperty(
    value,
    key,
    descriptor === undefined
      ? { value: entry, configurable: true, enumerable: true, writable: true }
      : { value: entry }
  );
}

function relativeIndex(value: SandboxValue, length: number, fallback: number): number {
  if (value === undefined) return fallback;
  const numeric = float32Number(value);
  const integer = Number.isNaN(numeric) ? 0 : Math.trunc(numeric);
  return integer < 0 ? Math.max(length + integer, 0) : Math.min(integer, length);
}
