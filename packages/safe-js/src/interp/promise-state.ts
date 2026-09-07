import type { SandboxPromise, SandboxValue } from "./values.js";

export type PromiseState = { status: "pending" } | { status: "fulfilled" | "rejected"; value: SandboxValue };

export const promiseStates = new WeakMap<SandboxPromise, PromiseState>();
