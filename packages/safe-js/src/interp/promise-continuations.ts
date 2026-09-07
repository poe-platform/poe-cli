import type { SandboxClosure, SandboxObject, SandboxPromise, SandboxValue } from "./values.js";

export type PromiseAdoptionBridge = {
  source: SandboxPromise;
  owner: SandboxPromise | undefined;
  settled: boolean;
  promise: Promise<SandboxValue>;
  resolve: SandboxClosure;
  reject: SandboxClosure;
  rejectNative: (reason: unknown) => void;
};

export const promiseAdoptions = new WeakMap<SandboxPromise, SandboxObject>();
export const promiseAdoptionBridges = new WeakMap<object, PromiseAdoptionBridge>();
export const promiseAdoptionResolvers = new WeakMap<SandboxClosure, {
  bridge: SandboxObject; action: "fulfilled" | "rejected"
}>();

export type PromiseContinuation =
  | { kind: "capability"; state: {promise: SandboxPromise; settled: boolean};
      resolution?: {status: "fulfilled" | "rejected"; value: SandboxValue} }
  | { kind: "reaction"; phase: "waiting" | "running"; source: SandboxPromise; onFulfilled: SandboxValue; onRejected: SandboxValue;
      capability?: {promise: SandboxPromise; resolve: SandboxClosure; reject: SandboxClosure} };

export const promiseContinuations = new WeakMap<SandboxPromise, PromiseContinuation>();
export const promiseReactionResults = new WeakMap<SandboxPromise, Set<SandboxPromise>>();
export const promiseProducers = new WeakMap<SandboxPromise, Set<SandboxPromise>>();

export function trackPromiseContinuation(promise: SandboxPromise, continuation: PromiseContinuation): void {
  promiseContinuations.set(promise, continuation);
  if (continuation.kind === "reaction") {
    let results = promiseReactionResults.get(continuation.source);
    if (results === undefined) promiseReactionResults.set(continuation.source, results = new Set());
    results.add(promise);
    if (continuation.capability !== undefined) {
      let producers = promiseProducers.get(continuation.capability.promise);
      if (producers === undefined) promiseProducers.set(continuation.capability.promise, producers = new Set());
      producers.add(promise);
    }
  }
  const release = () => {
    promiseContinuations.delete(promise);
    if (continuation.kind === "capability") delete continuation.resolution;
    else {
      const results = promiseReactionResults.get(continuation.source);
      results?.delete(promise);
      if (results?.size === 0) promiseReactionResults.delete(continuation.source);
      if (continuation.capability !== undefined) {
        const producers = promiseProducers.get(continuation.capability.promise);
        producers?.delete(promise);
        if (producers?.size === 0) promiseProducers.delete(continuation.capability.promise);
      }
    }
  };
  promise.promise.then(release, release);
}
