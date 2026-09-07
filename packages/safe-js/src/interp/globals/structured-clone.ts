import type { Budget } from "../budget.js";
import { arrayBufferDetached, arrayBufferLength, arrayBufferOptions, isSandboxArrayBuffer } from "../array-buffer.js";
import { readPropertyDescriptor } from "../accessors.js";
import { getSandboxPropertyDescriptor } from "../object-model.js";
import { acquireSandboxIterator, readIteratorResult, type SandboxIterator } from "../iteration.js";
import { isSandboxCollectionIterator } from "../collection-iterator.js";
import { isSandboxRegExpIterator } from "../regexp-iterator.js";
import { assertSandboxGraphDepth } from "../../graph-depth.js";
import { CompileScope } from "../regex/compile-guard.js";
import { retainValues } from "../resources.js";
import { createDataCheckpoint } from "../data-checkpoint.js";
import {
  allocateProducedSandboxValue, cloneSandboxValue, createSandboxClosure,
  isSandboxClosure, isSandboxMap, isSandboxPromise, isSandboxSet, reconcileCompiledValues,
  type SandboxCallContext, type SandboxClosure, type SandboxValue
} from "../values.js";

const transferBuffer = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, "transfer")?.value;

export function createStructuredCloneGlobal(budget: Budget): SandboxClosure {
  return createSandboxClosure({
    guest: true, sandbox: true, name: "structuredClone", length: 1,
    call: (args, context) => {
      if (args.length === 0) throw new TypeError("structuredClone requires a value argument.");
      const [value, options] = args;
      if (options === undefined || options === null) return cloneStructuredValue(value, [], budget, context);
      if (typeof options !== "object") throw new TypeError("structuredClone options must be an object.");
      return cloneWithOptions(value, options, budget, context);
    }
  });
}

async function cloneWithOptions(value: SandboxValue, options: SandboxValue, budget: Budget, context?: SandboxCallContext): Promise<SandboxValue> {
  const bridge: SandboxCallContext = {
    ...context, stack: context?.stack ?? [], thisValue: undefined,
    getProperty: context?.getProperty ?? ((object, key) => {
      const descriptor = getSandboxPropertyDescriptor(object, key, budget);
      return descriptor === undefined ? undefined : readPropertyDescriptor(descriptor, object, context);
    })
  };
  let current: SandboxValue;
  let iterator: SandboxIterator | undefined;
  const items: SandboxValue[] = [];
  const release = retainValues(budget, () => [value, options, current, items, iterator?.retainedValue]);
  try {
    current = await bridge.getProperty!(options, "transfer");
    if (current !== undefined) {
      if (current === null || typeof current !== "object") throw new TypeError("Transfer list must be an iterable object.");
      iterator = await acquireSandboxIterator(current, budget, bridge);
      if (iterator === undefined) throw new TypeError("Transfer list must be iterable.");
      for (;;) {
        budget.visitNode();
        const result = await iterator.next();
        current = result as unknown as SandboxValue;
        if ((await readIteratorResult(iterator, result, "done")).value) break;
        current = (await readIteratorResult(iterator, result, "value")).value;
        if (current === null || typeof current !== "object") {
          throw new TypeError("Transfer list elements must be objects.");
        }
        budget.allocateArrayLength(items.length + 1);
        budget.provisionDataUsage(items.length + 2)();
        items.push(current);
      }
    }
    const seen = new Set<ArrayBuffer>();
    const transfers: ArrayBuffer[] = [];
    for (const item of items) {
      budget.visitNode();
      if (!isSandboxArrayBuffer(item) || seen.has(item))
        throw new DOMException("Invalid or duplicate transferable.", "DataCloneError");
      seen.add(item);
      transfers.push(item);
    }
    return cloneStructuredValue(value, transfers, budget, context);
  } finally { release(); }
}

function cloneStructuredValue(value: SandboxValue, transfers: ArrayBuffer[], budget: Budget, context?: SandboxCallContext): SandboxValue {
  const parent = context?.compilation;
  const operation = budget.acquireCompileOwner(false, parent?.owner);
  const compilation = parent?.owner === operation.owner ? parent : new CompileScope(operation.owner);
  const buffers = new WeakMap<ArrayBuffer, ArrayBuffer>();
  let clone: SandboxValue;
  const release = retainValues(budget, () => [value, clone, transfers]);
  try {
    let transferSize = 0;
    for (const buffer of transfers) {
      const length = arrayBufferLength(buffer);
      budget.allocateArrayLength(arrayBufferOptions(buffer)?.maxByteLength ?? length);
      transferSize += length + 1;
      // Transferred buffers are placeholders during serialization. Detached
      // entries fail in the later ordered transfer pass, not while cloning.
      if (arrayBufferDetached(buffer)) buffers.set(buffer, new ArrayBuffer(0));
    }
    budget.provisionDataUsage(transferSize)();
    clone = cloneSandboxValue(value, { compilation, resetRegexLastIndex: true, structuredClone: true, float32Buffers: buffers });
    assertSandboxGraphDepth(clone);
    assertStructuredCloneable(clone, new WeakSet());
    allocateProducedSandboxValue(clone, budget);
    if (compilation !== parent) reconcileCompiledValues(budget, [clone], compilation);
    if (transfers.length > 0) {
      createDataCheckpoint(budget, context)(clone, 0, true);
      // Pay every fallible SafeJS budget charge before committing ownership loss.
      budget.visitNode(transferSize + transfers.length);
      budget.provisionDataUsage(transferBuffer === undefined ? transferSize : transfers.length)();
      for (const buffer of transfers) {
        if (arrayBufferDetached(buffer)) throw new DOMException("Cannot transfer a detached ArrayBuffer.", "DataCloneError");
        if (transferBuffer !== undefined) Reflect.apply(transferBuffer, buffer, [0]);
        else structuredClone(buffer, { transfer: [buffer] });
        if (!arrayBufferDetached(buffer)) throw new DOMException("ArrayBuffer cannot be transferred.", "DataCloneError");
      }
    }
    return clone;
  } finally {
    release();
    if (compilation !== parent) compilation.dispose();
    operation.release();
  }
}

function assertStructuredCloneable(value: SandboxValue, seen: WeakSet<object>): void {
  if (typeof value === "symbol") throw new DOMException("Cannot clone a symbol value.", "DataCloneError");
  if (isSandboxClosure(value) || isSandboxPromise(value) || isSandboxCollectionIterator(value) || isSandboxRegExpIterator(value))
    throw new DOMException("Cannot clone closures, promises, or collection iterators.", "DataCloneError");
  if (typeof value !== "object" || value === null || seen.has(value)) return;
  seen.add(value);
  if (isSandboxMap(value)) {
    for (const [key, entry] of value.entries) {
      assertStructuredCloneable(key, seen);
      assertStructuredCloneable(entry, seen);
    }
    return;
  }
  if (isSandboxSet(value)) {
    for (const entry of value.values) assertStructuredCloneable(entry, seen);
    return;
  }
  for (const entry of Object.values(value)) assertStructuredCloneable(entry, seen);
}
