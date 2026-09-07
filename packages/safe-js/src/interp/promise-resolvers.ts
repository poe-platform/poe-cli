import type { SandboxClosure, SandboxPromise } from "./values.js";

export const promiseResolvingFunctions = new WeakMap<SandboxClosure, {
  promise: SandboxPromise;
  settled: boolean;
}>();
