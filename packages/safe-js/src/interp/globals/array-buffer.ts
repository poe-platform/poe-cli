import type { Budget } from "../budget.js";
import { arrayBufferLength, arrayBufferOptions, arrayBufferPrototypes, isSandboxArrayBuffer } from "../array-buffer.js";
import { accessorAdapter, readPropertyDescriptor } from "../accessors.js";
import { createSandboxClosure, type SandboxCallContext, type SandboxClosure, type SandboxObject, type SandboxValue } from "../values.js";
import { getSandboxDataProperty, getSandboxPropertyDescriptor, getSandboxPrototype, materializeFunctionProperties, registerIntrinsicFunction, registerIntrinsicObject, setSandboxPrototype } from "../object-model.js";
import { invokeBuiltinClosure } from "../builtin-call.js";
import { registerBuiltinIdentities } from "../intrinsics.js";
import { sandboxNumber } from "../string-coercion.js";
import { retainValues } from "../resources.js";

const resizeBuffer = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, "resize")!.value as (length: number) => void;

export function createArrayBufferGlobal(budget: Budget): SandboxClosure {
  const prototype: SandboxObject = Object.create(null);
  const constructor = createSandboxClosure({
    guest: true, sandbox: true, name: "ArrayBuffer", length: 1,
    call: () => { throw new TypeError("ArrayBuffer requires new."); },
    construct: async (args, context) => {
      let selected: unknown;
      let current: SandboxValue;
      const bridge: SandboxCallContext = {
        ...context, stack: context?.stack ?? [], thisValue: undefined,
        getProperty: context?.getProperty ?? ((value, key) => {
          const descriptor = getSandboxPropertyDescriptor(value, key, budget);
          return descriptor === undefined ? getSandboxDataProperty(value, key, budget)
            : readPropertyDescriptor(descriptor, value, bridge);
        }),
        invokeClosure: context?.invokeClosure ?? ((callee, values, receiver, construct) =>
          invokeBuiltinClosure(callee, values, budget, context, receiver, construct))
      };
      const release = retainValues(budget, () => [selected, current, ...args]);
      try {
        const number = await sandboxNumber(args[0], budget, bridge);
        const length = Number.isNaN(number) ? 0 : Math.trunc(number);
        if (length < 0 || !Number.isSafeInteger(length)) throw new RangeError("Invalid ArrayBuffer length.");
        let maxByteLength: number | undefined;
        if (args[1] !== null && typeof args[1] === "object") {
          current = await bridge.getProperty!(args[1], "maxByteLength");
          if (current !== undefined) {
            const maximum = await sandboxNumber(current, budget, bridge);
            maxByteLength = Number.isNaN(maximum) ? 0 : Math.trunc(maximum);
            if (!Number.isSafeInteger(maxByteLength) || maxByteLength < length)
              throw new RangeError("Invalid ArrayBuffer maximum length.");
          }
        }
        const target = context?.newTarget ?? constructor;
        selected = await bridge.getProperty!(target, "prototype");
        budget.allocateArrayLength(maxByteLength ?? length);
        budget.provisionDataUsage(length + 1)();
        const result = Reflect.construct(ArrayBuffer, [length, maxByteLength === undefined ? undefined : { maxByteLength }]) as ArrayBuffer;
        setSandboxPrototype(result, selected !== null && typeof selected === "object" ? selected : prototype, budget);
        return result;
      } finally { release(); }
    }
  });
  Object.defineProperty(materializeFunctionProperties(constructor), "prototype", { value: prototype, writable: false });
  Object.defineProperty(materializeFunctionProperties(constructor), "isView", {
    writable: true, configurable: true,
    value: createSandboxClosure({ guest: true, sandbox: true, name: "isView", length: 1,
      call: args => ArrayBuffer.isView(args[0]) })
  });
  Object.defineProperties(prototype, {
    constructor: { value: constructor, writable: true, configurable: true },
    [Symbol.toStringTag]: { value: "ArrayBuffer", configurable: true }
  });
  const getters: SandboxClosure[] = [];
  Object.defineProperty(prototype, "resize", { writable: true, configurable: true,
    value: createSandboxClosure({ guest: true, sandbox: true, name: "resize", length: 1,
      call: async (args, context) => {
        const receiver = context?.thisValue;
        if (!isSandboxArrayBuffer(receiver) || arrayBufferOptions(receiver) === undefined)
          throw new TypeError("ArrayBuffer resize requires a resizable buffer receiver.");
        const release = retainValues(budget, () => [receiver, ...args]);
        try {
          const number = await sandboxNumber(args[0], budget, context);
          const length = Number.isNaN(number) ? 0 : Math.trunc(number);
          if (!Number.isSafeInteger(length) || length < 0 || length > arrayBufferOptions(receiver)!.maxByteLength)
            throw new RangeError("Invalid ArrayBuffer resize length.");
          budget.allocateArrayLength(length);
          budget.provisionDataUsage(Math.max(length - arrayBufferLength(receiver), 0))();
          Reflect.apply(resizeBuffer, receiver, [length]);
          return undefined;
        } finally { release(); }
      }
    })
  });
  for (const key of ["byteLength", "maxByteLength", "resizable"] as const) {
    const getter = createSandboxClosure({ guest: true, sandbox: true, name: `get ${key}`, length: 0,
      call: (_args, context) => {
        if (!isSandboxArrayBuffer(context?.thisValue)) throw new TypeError(`ArrayBuffer ${key} requires a buffer receiver.`);
        if (key === "byteLength") return arrayBufferLength(context.thisValue);
        const options = arrayBufferOptions(context.thisValue);
        return key === "resizable" ? options !== undefined : options?.maxByteLength ?? arrayBufferLength(context.thisValue);
      }
    });
    Object.defineProperty(prototype, key, { get: accessorAdapter(getter, "get"), configurable: true });
    getters.push(getter);
  }
  setSandboxPrototype(prototype, getSandboxPrototype(Object.create(null), budget));
  arrayBufferPrototypes.set(budget, prototype);
  registerBuiltinIdentities(budget, { ArrayBuffer: constructor });
  registerIntrinsicFunction(budget, constructor);
  for (const getter of getters) registerIntrinsicFunction(budget, getter);
  registerIntrinsicObject(budget, prototype);
  return constructor;
}
