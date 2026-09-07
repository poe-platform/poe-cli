import type { Budget } from "../budget.js";
import {
  checkFloat32Allocation,
  float32Number,
  float32Storage,
  float32ViewLayouts,
  isFloat32Array,
  isFloat32Index
} from "../float32.js";
import { createSandboxClosure, isSandboxClosure, measureSandboxData, type SandboxCallContext, type SandboxClosure, type SandboxObject, type SandboxValue } from "../values.js";
import { accessorAdapter, readPropertyDescriptor } from "../accessors.js";
import { float32Prototypes } from "../float32-prototypes.js";
import { getBoxedPrototype, getSandboxDataProperty, getSandboxPropertyDescriptor, getSandboxPrototype, materializeFunctionProperties, registerIntrinsicFunction, registerIntrinsicObject, setSandboxPrototype } from "../object-model.js";
import { registerBuiltinIdentities, resolveIntrinsicIdentity } from "../intrinsics.js";
import { invokeBuiltinClosure } from "../builtin-call.js";
import { retainValues } from "../resources.js";
import { sandboxNumber, sandboxString } from "../string-coercion.js";
import { acquireSandboxIterator, readIteratorResult, type SandboxIterator } from "../iteration.js";
import { createDataCheckpoint } from "../data-checkpoint.js";
import { createSandboxBox } from "../boxed.js";
import { arrayBufferLength, arrayBufferOptions, isSandboxArrayBuffer } from "../array-buffer.js";

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
          if (isSandboxArrayBuffer(args[0])) {
            const buffer = args[0];
            const number = await sandboxNumber(args[1], budget, context);
            const offset = Number.isNaN(number) ? 0 : Math.trunc(number);
            if (!Number.isSafeInteger(offset) || offset < 0 || offset % 4 !== 0)
              throw new RangeError("Invalid Float32Array buffer offset.");
            const bytes = arrayBufferLength(buffer);
            let length: number;
            if (args[2] === undefined) {
              if ((arrayBufferOptions(buffer) === undefined && bytes % 4 !== 0) || offset > bytes)
                throw new RangeError("Invalid Float32Array buffer length.");
              length = Math.floor((bytes - offset) / 4);
            } else {
              const size = await sandboxNumber(args[2], budget, context);
              length = Number.isNaN(size) ? 0 : Math.trunc(size);
              if (!Number.isSafeInteger(length) || length < 0 || offset + length * 4 > arrayBufferLength(buffer))
                throw new RangeError("Invalid Float32Array view length.");
            }
            budget.allocateArrayLength(length);
            const result = new Float32Array(buffer, offset, args[2] === undefined ? undefined : length);
            if (arrayBufferOptions(buffer) !== undefined)
              float32ViewLayouts.set(result, { byteOffset: offset, ...(args[2] === undefined ? {} : { length }) });
            setSandboxPrototype(result, prototype, budget);
            return result;
          }
          const result = args[0] !== null && typeof args[0] === "object" && !isFloat32Array(args[0])
            ? await allocateFloat32Input(args[0], budget, context)
            : allocateFloat32Array(args[0], budget);
          setSandboxPrototype(result, prototype, budget);
          return result;
        } finally { release(); }
      })();
    }
  });
  constructors.add(constructor);
  return constructor;
}

async function allocateFloat32Input(source: SandboxValue, budget: Budget, context?: SandboxCallContext): Promise<Float32Array> {
  const callerContext = context;
  const bridge: SandboxCallContext = {
    ...callerContext, stack: callerContext?.stack ?? [], thisValue: undefined,
    getProperty: callerContext?.getProperty ?? ((value, key) => {
      const descriptor = getSandboxPropertyDescriptor(value, key, budget);
      return descriptor === undefined ? getSandboxDataProperty(value, key, budget)
        : readPropertyDescriptor(descriptor, value, bridge);
    }),
    invokeClosure: callerContext?.invokeClosure ?? ((callee, values, receiver, construct) =>
      invokeBuiltinClosure(callee, values, budget, callerContext, receiver, construct))
  };
  const values: SandboxValue[] = [];
  let iterator: SandboxIterator | undefined;
  let current: SandboxValue;
  let result: Float32Array | undefined;
  const release = retainValues(budget, () => [source, values, iterator?.retainedValue, current, result]);
  const checkData = createDataCheckpoint(budget, bridge);
  try {
    iterator = await acquireSandboxIterator(source, budget, bridge);
    let length: number;
    if (iterator !== undefined) {
      while (true) {
        budget.visitNode();
        const next = await iterator.next();
        if (typeof next !== "object" || next === null) throw new TypeError("Iterator result must be an object.");
        if ((await readIteratorResult(iterator, next, "done")).value) break;
        current = (await readIteratorResult(iterator, next, "value")).value;
        budget.allocateArrayLength(values.length + 1);
        values.push(current);
        checkData(values, 1 + (budget.limits.dataSize === undefined ? 0 : measureSandboxData([current])));
      }
      length = values.length;
    } else {
      current = await bridge.getProperty!(source, "length");
      const number = await sandboxNumber(current, budget, bridge);
      length = Number.isNaN(number) || number <= 0 ? 0 : Math.min(Math.trunc(number), Number.MAX_SAFE_INTEGER);
    }
    checkFloat32Allocation(length, budget);
    result = new Float32Array(length);
    checkData(result, 0, true);
    for (let index = 0; index < length; index++) {
      budget.visitNode();
      current = iterator === undefined ? await bridge.getProperty!(source, String(index)) : values[index];
      result[index] = await sandboxNumber(current, budget, bridge);
    }
    return result;
  } finally { release(); }
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
  Object.defineProperty(materializeFunctionProperties(typedArray), "from", {
    writable: true, configurable: true,
    value: createSandboxClosure({ guest: true, sandbox: true, name: "from", length: 1,
      call: async (args, context) => {
        const target = context?.thisValue;
        const [source, mapper, receiver] = args;
        if (!isSandboxClosure(target) || target.construct === undefined)
          throw new TypeError("TypedArray.from requires a constructor receiver.");
        if (mapper !== undefined && !isSandboxClosure(mapper))
          throw new TypeError("TypedArray.from mapper must be callable.");
        if (source === null || source === undefined)
          throw new TypeError("TypedArray.from requires a non-null source.");
        const callerContext = context;
        context = {
          ...callerContext,
          stack: callerContext?.stack ?? [],
          thisValue: target,
          getProperty: callerContext?.getProperty ?? ((value, key) => {
            const descriptor = getSandboxPropertyDescriptor(value, key, budget);
            return descriptor === undefined ? getSandboxDataProperty(value, key, budget)
              : readPropertyDescriptor(descriptor, value, context);
          }),
          invokeClosure: callerContext?.invokeClosure ?? ((callee, values, thisValue, construct) =>
            invokeBuiltinClosure(callee, values, budget, callerContext, thisValue, construct))
        };
        let result: SandboxValue;
        let current: SandboxValue;
        let iterator: SandboxIterator | undefined;
        const values: SandboxValue[] = [];
        const release = retainValues(budget, () => [target, result, current, iterator?.retainedValue, values, ...args]);
        const checkData = createDataCheckpoint(budget, context);
        const read = (key: string) => context?.getProperty === undefined
          ? getSandboxDataProperty(source, key, budget) : context.getProperty(source, key);
        try {
          iterator = await acquireSandboxIterator(source, budget, context);
          let length: number;
          if (iterator !== undefined) {
            while (true) {
              budget.visitNode();
              const next = await iterator.next();
              if (typeof next !== "object" || next === null) throw new TypeError("Iterator result must be an object.");
              if ((await readIteratorResult(iterator, next, "done")).value) break;
              current = (await readIteratorResult(iterator, next, "value")).value;
              budget.allocateArrayLength(values.length + 1);
              values.push(current);
              checkData(values, 1 + (budget.limits.dataSize === undefined ? 0 : measureSandboxData([current])));
            }
            length = values.length;
          } else {
            const number = await sandboxNumber(await read("length"), budget, context);
            length = Number.isNaN(number) || number <= 0 ? 0 : Math.min(Math.trunc(number), Number.MAX_SAFE_INTEGER);
          }
          result = await invokeBuiltinClosure(target, [length], budget, context, undefined, true);
          if (!isFloat32Array(result) || float32Storage(result).length < length)
            throw new TypeError("TypedArray.from constructor must return sufficient typed storage.");
          checkData(result, 0, true);
          for (let index = 0; index < length; index++) {
            budget.visitNode();
            current = iterator === undefined ? await read(String(index)) : values[index];
            if (mapper !== undefined)
              current = await invokeBuiltinClosure(mapper, [current, index], budget, context, receiver);
            result[index] = await sandboxNumber(current, budget, context);
          }
          return result;
        } finally { release(); }
      }
    })
  });
  Object.defineProperty(materializeFunctionProperties(typedArray), "of", {
    writable: true, configurable: true,
    value: createSandboxClosure({ guest: true, sandbox: true, name: "of", length: 0,
      call: async (args, context) => {
        const target = context?.thisValue;
        if (!isSandboxClosure(target) || target.construct === undefined)
          throw new TypeError("TypedArray.of requires a constructor receiver.");
        let result: SandboxValue;
        const release = retainValues(budget, () => [target, result, ...args]);
        try {
          result = await invokeBuiltinClosure(target, [args.length], budget, context, undefined, true);
          if (!isFloat32Array(result) || float32Storage(result).length < args.length)
            throw new TypeError("TypedArray.of constructor must return sufficient typed storage.");
          for (let index = 0; index < args.length; index++) {
            budget.visitNode();
            result[index] = await sandboxNumber(args[index], budget, context);
          }
          return result;
        } finally { release(); }
      }
    })
  });
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
  const species = createSandboxClosure({ guest: true, sandbox: true, name: "get [Symbol.species]", length: 0,
    call: (_args, context) => context?.thisValue });
  getters.push(species);
  Object.defineProperty(materializeFunctionProperties(typedArray), Symbol.species, {
    get: accessorAdapter(species, "get"), configurable: true
  });
  for (const key of ["length", "byteLength", "byteOffset", "buffer"] as const) {
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
  for (const key of ["set", "slice", "subarray", "fill", "copyWithin", "reverse", "at", "includes", "indexOf", "lastIndexOf", "forEach", "every", "some", "find", "findIndex", "findLast", "findLastIndex", "sort", "reduce", "reduceRight", "map", "filter", "toLocaleString"])
    Object.defineProperty(shared, key, { value: getFloat32Member(new Float32Array(0), key, budget, constructor), writable: true, configurable: true });
  const arrayPrototype = resolveIntrinsicIdentity(budget, '["Array","prototype"]') as SandboxObject;
  Object.defineProperty(shared, "toString", { value: getSandboxDataProperty(arrayPrototype, "toString", budget), writable: true, configurable: true });
  Object.defineProperty(shared, "join", { writable: true, configurable: true,
    value: createSandboxClosure({ guest: true, sandbox: true, name: "join", length: 1,
      call: async (args, context) => {
        if (!isFloat32Array(context?.thisValue)) throw new TypeError("TypedArray join requires a typed array receiver.");
        const receiver = context.thisValue;
        const length = float32Storage(receiver, true).length;
        let separator = ",";
        let text = "";
        const release = retainValues(budget, () => [receiver, separator, text, ...args]);
        try {
          if (args[0] !== undefined) separator = await sandboxString(args[0], budget, context);
          for (let index = 0; index < length; index++) {
            budget.visitNode();
            const value = receiver[index];
            text = budget.allocateString(text + (index === 0 ? "" : separator) + (value === undefined ? "" : String(value)));
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
        float32Storage(context.thisValue, true);
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
  budget: Budget,
  defaultConstructor?: SandboxClosure
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
  if (!["set", "slice", "subarray", "fill", "copyWithin", "reverse", "at", "includes", "indexOf", "lastIndexOf", "forEach", "every", "some", "find", "findIndex", "findLast", "findLastIndex", "sort", "reduce", "reduceRight", "map", "filter", "toLocaleString"].includes(key)) return undefined;
  const numberPrototype = key === "toLocaleString" ? getBoxedPrototype(0, budget) : undefined;
  return createSandboxClosure({
    guest: true,
    sandbox: true,
    name: key,
    length: key === "reverse" || key === "toLocaleString" ? 0 : key === "sort" || key === "reduce" || key === "reduceRight" || key === "map" || key === "filter" || key === "set" || key === "fill" || key === "at" || key === "includes" || key === "indexOf" || key === "lastIndexOf" || key === "forEach" || key === "every" || key === "some" || key === "find" || key === "findIndex" || key === "findLast" || key === "findLastIndex" ? 1 : 2,
    call: (args, context) => {
      if (key === "sort" && args[0] !== undefined && !isSandboxClosure(args[0]))
        throw new TypeError("TypedArray sort comparator must be callable.");
      const receiver = context?.thisValue;
      if (!isFloat32Array(receiver))
        throw new TypeError(`Float32Array#${key} requires a Float32Array receiver.`);
      const storage = float32Storage(receiver, key === "sort" || key === "reduce" || key === "reduceRight" || key === "map" || key === "filter" || key === "slice" || key === "fill" || key === "copyWithin" || key === "reverse" || key === "at" || key === "includes" || key === "indexOf" || key === "lastIndexOf" || key === "forEach" || key === "every" || key === "some" || key === "find" || key === "findIndex" || key === "findLast" || key === "findLastIndex" || key === "toLocaleString");
      if (key === "reverse") {
        const release = retainValues(budget, () => [receiver, ...args]);
        try {
          const bytes = new Uint8Array(storage.buffer, storage.byteOffset, storage.length * 4);
          for (let lower = 0; lower < Math.floor(storage.length / 2); lower++) {
            const upper = storage.length - lower - 1;
            for (let offset = 0; offset < 4; offset++) {
              budget.visitNode();
              const saved = bytes[lower * 4 + offset];
              bytes[lower * 4 + offset] = bytes[upper * 4 + offset];
              bytes[upper * 4 + offset] = saved;
            }
          }
          return receiver;
        } finally { release(); }
      }
      const bridge: SandboxCallContext = {
        ...context, stack: context?.stack ?? [], thisValue: receiver,
        getProperty: context?.getProperty ?? ((value, property) => {
          const descriptor = getSandboxPropertyDescriptor(value, property, budget);
          return descriptor === undefined ? getSandboxDataProperty(value, property, budget)
            : readPropertyDescriptor(descriptor, value, bridge);
        }),
        invokeClosure: context?.invokeClosure ?? ((callee, values, thisValue, construct) =>
          invokeBuiltinClosure(callee, values, budget, context, thisValue, construct))
      };
      if (key === "sort") {
        const comparator = args[0] as SandboxClosure | undefined;
        if (storage.length < 2) return receiver;
        return (async () => {
          let items: Float32Array | undefined;
          let scratch: Float32Array | undefined;
          let comparisonResult: SandboxValue;
          const release = retainValues(budget, () => [receiver, items, scratch, comparisonResult, ...args]);
          const checkData = createDataCheckpoint(budget, bridge);
          try {
            checkFloat32Allocation(storage.length, budget);
            items = new Float32Array(storage.length);
            checkData(items, 0, true);
            checkFloat32Allocation(storage.length, budget);
            scratch = new Float32Array(storage.length);
            checkData(scratch, 0, true);
            for (let index = 0; index < storage.length; index++) {
              budget.visitNode();
              items[index] = receiver[index]!;
            }
            for (let width = 1; width < storage.length; width *= 2) {
              for (let start = 0; start < storage.length; start += width * 2) {
                const middle = Math.min(start + width, storage.length);
                const end = Math.min(start + width * 2, storage.length);
                let left = start;
                let right = middle;
                for (let output = start; output < end; output++) {
                  budget.visitNode();
                  let takeLeft = right === end;
                  if (left < middle && right < end) {
                    const a = items[left]!;
                    const b = items[right]!;
                    let order: number;
                    if (comparator !== undefined) {
                      comparisonResult = await invokeBuiltinClosure(comparator, [a, b], budget, bridge, undefined);
                      order = await sandboxNumber(comparisonResult, budget, bridge);
                      if (Number.isNaN(order)) order = 0;
                    } else if (Number.isNaN(a)) order = Number.isNaN(b) ? 0 : 1;
                    else if (Number.isNaN(b)) order = -1;
                    else if (a === 0 && b === 0) order = Object.is(a, -0) ? Object.is(b, -0) ? 0 : -1 : Object.is(b, -0) ? 1 : 0;
                    else order = a < b ? -1 : a > b ? 1 : 0;
                    takeLeft = order <= 0;
                  }
                  scratch[output] = takeLeft ? items[left++]! : items[right++]!;
                }
              }
              const previous: Float32Array = items;
              items = scratch;
              scratch = previous;
            }
            for (let index = 0; index < storage.length; index++) {
              budget.visitNode();
              receiver[index] = items[index]!;
            }
            return receiver;
          } finally { release(); }
        })();
      }
      if (key === "toLocaleString") {
        return (async () => {
          let text = "";
          const release = retainValues(budget, () => [receiver, text, ...args]);
          try {
            for (let index = 0; index < storage.length; index++) {
              budget.visitNode();
              const element = receiver[index];
              let part = "";
              if (element !== undefined) {
                const descriptor = context?.getProperty === undefined && numberPrototype !== undefined
                  ? getSandboxPropertyDescriptor(numberPrototype, "toLocaleString", budget) : undefined;
                const method = context?.getProperty === undefined && numberPrototype !== undefined
                  ? descriptor === undefined ? undefined : await readPropertyDescriptor(descriptor, element, bridge)
                  : await bridge.getProperty!(element, "toLocaleString");
                if (!isSandboxClosure(method)) throw new TypeError("Element toLocaleString must be callable.");
                const converted = await invokeBuiltinClosure(method, [args[0], args[1]], budget, bridge, element);
                part = await sandboxString(converted, budget, bridge);
              }
              text = budget.allocateString(text + (index === 0 ? "" : ",") + part);
            }
            return text;
          } finally { release(); }
        })();
      }
      if (key === "reduce" || key === "reduceRight") {
        const callback = args[0];
        if (!isSandboxClosure(callback)) throw new TypeError(`Float32Array#${key} callback must be callable.`);
        const hasInitialValue = args.length > 1;
        if (!hasInitialValue && storage.length === 0) throw new TypeError("Reduce of empty typed array with no initial value.");
        const backwards = key === "reduceRight";
        const first = backwards ? storage.length - 1 : 0;
        let accumulator = hasInitialValue ? args[1] : receiver[first];
        return (async () => {
          const release = retainValues(budget, () => [receiver, accumulator, ...args]);
          try {
            for (let index = hasInitialValue ? first : first + (backwards ? -1 : 1); backwards ? index >= 0 : index < storage.length; index += backwards ? -1 : 1) {
              budget.visitNode();
              accumulator = await invokeBuiltinClosure(callback, [accumulator, receiver[index], index, receiver], budget, bridge, undefined);
            }
            return accumulator;
          } finally { release(); }
        })();
      }
      if (key === "forEach" || key === "every" || key === "some" || key === "find" || key === "findIndex" || key === "findLast" || key === "findLastIndex") {
        const callback = args[0];
        if (!isSandboxClosure(callback)) throw new TypeError(`Float32Array#${key} callback must be callable.`);
        return (async () => {
          const release = retainValues(budget, () => [receiver, ...args]);
          try {
            const backwards = key === "findLast" || key === "findLastIndex";
            for (let index = backwards ? storage.length - 1 : 0; backwards ? index >= 0 : index < storage.length; index += backwards ? -1 : 1) {
              budget.visitNode();
              const element = receiver[index];
              const result = await invokeBuiltinClosure(callback, [element, index, receiver], budget, bridge, args[1]);
              if (key === "every" && !result) return false;
              if (key === "some" && result) return true;
              if ((key === "find" || key === "findLast") && result) return element;
              if ((key === "findIndex" || key === "findLastIndex") && result) return index;
            }
            return key === "findIndex" || key === "findLastIndex" ? -1 : key === "forEach" || key === "find" || key === "findLast" ? undefined : key === "every";
          } finally { release(); }
        })();
      }
      if (key === "includes" || key === "indexOf" || key === "lastIndexOf") {
        const notFound = key === "includes" ? false : -1;
        if (storage.length === 0) return notFound;
        return (async () => {
          const release = retainValues(budget, () => [receiver, ...args]);
          try {
            const backwards = key === "lastIndexOf";
            const numeric = backwards && args.length < 2 ? storage.length - 1
              : await sandboxNumber(args[1], budget, bridge);
            let start = relativeIndex(numeric, storage.length);
            if (backwards) {
              const integer = Number.isNaN(numeric) ? 0 : Math.trunc(numeric);
              start = integer < 0 ? storage.length + integer : Math.min(integer, storage.length - 1);
            }
            for (let index = start; backwards ? index >= 0 : index < storage.length; index += backwards ? -1 : 1) {
              budget.visitNode();
              if (key !== "includes" && !(index in receiver)) continue;
              const element = receiver[index];
              if (element === args[0] || (key === "includes" && Number.isNaN(element) && Number.isNaN(args[0])))
                return key === "includes" ? true : index + 0;
            }
            return notFound;
          } finally { release(); }
        })();
      }
      if (key === "at") {
        return (async () => {
          const release = retainValues(budget, () => [receiver, ...args]);
          try {
            const number = await sandboxNumber(args[0], budget, bridge);
            const relative = Number.isNaN(number) ? 0 : Math.trunc(number);
            const index = relative < 0 ? storage.length + relative : relative;
            return index < 0 || index >= storage.length ? undefined : receiver[index];
          } finally { release(); }
        })();
      }
      if (key === "copyWithin") {
        return (async () => {
          const release = retainValues(budget, () => [receiver, ...args]);
          try {
            const target = relativeIndex(await sandboxNumber(args[0], budget, bridge), storage.length);
            const start = relativeIndex(await sandboxNumber(args[1], budget, bridge), storage.length);
            const end = args[2] === undefined ? storage.length
              : relativeIndex(await sandboxNumber(args[2], budget, bridge), storage.length);
            let count = Math.min(end - start, storage.length - target);
            if (count > 0) {
              const current = float32Storage(receiver, true);
              count = Math.min(count, current.length - start, current.length - target);
              if (count > 0) {
                const bytes = new Uint8Array(current.buffer, current.byteOffset, current.length * 4);
                const direction = start < target && target < start + count ? -1 : 1;
                let from = start * 4 + (direction < 0 ? count * 4 - 1 : 0);
                let to = target * 4 + (direction < 0 ? count * 4 - 1 : 0);
                for (let remaining = count * 4; remaining > 0; remaining--) {
                  budget.visitNode();
                  bytes[to] = bytes[from];
                  from += direction;
                  to += direction;
                }
              }
            }
            return receiver;
          } finally { release(); }
        })();
      }
      if (key === "fill") {
        return (async () => {
          const release = retainValues(budget, () => [receiver, ...args]);
          try {
            const value = await sandboxNumber(args[0], budget, bridge);
            const start = relativeIndex(await sandboxNumber(args[1], budget, bridge), storage.length);
            const end = args[2] === undefined ? storage.length
              : relativeIndex(await sandboxNumber(args[2], budget, bridge), storage.length);
            const current = float32Storage(receiver, true);
            for (let index = start; index < Math.min(end, current.length); index++) {
              budget.visitNode();
              receiver[index] = value;
            }
            return receiver;
          } finally { release(); }
        })();
      }
      if (key === "set") {
        return (async () => {
          const [source, offsetValue = 0] = args;
          let current: SandboxValue;
          let sourceObject: SandboxValue;
          const release = retainValues(budget, () => [receiver, sourceObject, current, ...args]);
          try {
            const number = await sandboxNumber(offsetValue, budget, bridge);
            const offset = Number.isNaN(number) ? 0 : Math.trunc(number);
            if (offset < 0) throw new RangeError("Float32Array#set offset is out of bounds.");
            const targetStorage = float32Storage(receiver, true);
            if (source === null || source === undefined) throw new TypeError("Float32Array#set requires a non-null source.");
            let length: number;
            if (isFloat32Array(source)) length = float32Storage(source, true).length;
            else {
              sourceObject = typeof source === "object" ? source : createSandboxBox(source);
              current = await bridge.getProperty!(sourceObject, "length");
              const size = await sandboxNumber(current, budget, bridge);
              length = Number.isNaN(size) || size <= 0 ? 0 : Math.min(Math.trunc(size), Number.MAX_SAFE_INTEGER);
            }
            if (offset + length > targetStorage.length) throw new RangeError("Float32Array#set source is out of bounds.");
            if (isFloat32Array(source)) Float32Array.prototype.set.call(receiver, source, offset);
            else for (let index = 0; index < length; index++) {
              budget.visitNode();
              current = await bridge.getProperty!(sourceObject, String(index));
              receiver[offset + index] = await sandboxNumber(current, budget, bridge);
            }
            return undefined;
          } finally { release(); }
        })();
      }
      const callback = key === "map" || key === "filter" ? args[0] : undefined;
      if ((key === "map" || key === "filter") && !isSandboxClosure(callback)) throw new TypeError(`Float32Array#${key} callback must be callable.`);
      return (async () => {
        let candidate: SandboxValue;
        let result: SandboxValue;
        let mapped: SandboxValue;
        const kept: Array<number | undefined> = [];
        const release = retainValues(budget, () => [receiver, candidate, result, mapped, kept, ...args]);
        try {
          const start = key === "map" || key === "filter" ? 0 : relativeIndex(await sandboxNumber(args[0], budget, bridge), storage.length);
          const end = key === "map" || key === "filter" || args[1] === undefined ? storage.length
            : relativeIndex(await sandboxNumber(args[1], budget, bridge), storage.length);
          let length = Math.max(end - start, 0);
          if (key === "filter") {
            const checkData = createDataCheckpoint(budget, bridge);
            for (let index = 0; index < length; index++) {
              budget.visitNode();
              const element = receiver[index];
              const selected = await invokeBuiltinClosure(callback as SandboxClosure, [element, index, receiver], budget, bridge, args[1]);
              if (selected) {
                budget.allocateArrayLength(kept.length + 1);
                kept.push(element);
                checkData(kept, 1 + (budget.limits.dataSize === undefined ? 0 : measureSandboxData([element])));
              }
            }
            length = kept.length;
          }
          const layout = float32ViewLayouts.get(receiver);
          const offset = (layout?.byteOffset ?? storage.byteOffset) + start * 4;
          const tracking = layout !== undefined && layout.length === undefined && args[1] === undefined;
          if (defaultConstructor !== undefined) {
            candidate = await bridge.getProperty!(receiver, "constructor");
            if (candidate !== undefined) {
              if (candidate === null || typeof candidate !== "object")
                throw new TypeError("TypedArray constructor must be an object.");
              candidate = await bridge.getProperty!(candidate, Symbol.species);
              if (candidate !== undefined && candidate !== null &&
                  (!isSandboxClosure(candidate) || candidate.construct === undefined))
                throw new TypeError("TypedArray species must be a constructor.");
            }
          }
          if (candidate !== undefined && candidate !== null && candidate !== defaultConstructor) {
            const values: SandboxValue[] = key !== "subarray" ? [length]
              : [storage.buffer, offset, tracking ? undefined : length];
            result = await invokeBuiltinClosure(candidate as SandboxClosure, values, budget, bridge, undefined, true);
            if (!isFloat32Array(result)) throw new TypeError("TypedArray species must return typed storage.");
            const target = float32Storage(result, key !== "subarray");
            if (key !== "subarray" && target.length < length)
              throw new TypeError("TypedArray species returned insufficient storage.");
          }
          if (key === "subarray") {
            if (result === undefined) {
              result = new Float32Array(storage.buffer, offset, tracking ? undefined : length);
              if (arrayBufferOptions(storage.buffer) !== undefined)
                float32ViewLayouts.set(result, { byteOffset: offset, ...(tracking ? {} : { length }) });
            }
            return result;
          }
          if (result === undefined) {
            checkFloat32Allocation(length, budget);
            result = new Float32Array(length);
          }
          if (!isFloat32Array(result)) throw new TypeError("TypedArray species must return typed storage.");
          if (key === "filter") {
            for (let index = 0; index < length; index++) {
              budget.visitNode();
              result[index] = kept[index] ?? NaN;
            }
            return result;
          }
          if (key === "map") {
            for (let index = 0; index < length; index++) {
              budget.visitNode();
              mapped = await invokeBuiltinClosure(callback as SandboxClosure, [receiver[index], index, receiver], budget, bridge, args[1]);
              result[index] = await sandboxNumber(mapped, budget, bridge);
            }
            return result;
          }
          if (length > 0) {
            const current = float32Storage(receiver, true);
            const target = float32Storage(result, true);
            const count = Math.min(length, Math.max(current.length - start, 0));
            if (count > 0) {
              const sourceBytes = new Uint8Array(current.buffer, current.byteOffset + start * 4, count * 4);
              const targetBytes = new Uint8Array(target.buffer, target.byteOffset, count * 4);
              if (current.buffer === target.buffer && targetBytes.byteOffset > sourceBytes.byteOffset &&
                  targetBytes.byteOffset < sourceBytes.byteOffset + sourceBytes.length) {
                for (let index = 0; index < sourceBytes.length; index++) {
                  budget.visitNode();
                  targetBytes[index] = sourceBytes[index]!;
                }
              } else targetBytes.set(sourceBytes);
            }
          }
          return result;
        } finally { release(); }
      })();
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

function relativeIndex(numeric: number, length: number): number {
  const integer = Number.isNaN(numeric) ? 0 : Math.trunc(numeric);
  return integer < 0 ? Math.max(length + integer, 0) : Math.min(integer, length);
}
