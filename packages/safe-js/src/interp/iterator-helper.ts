import type { SandboxValue } from "./values.js";
import type { IteratorWrapperState } from "./iterator-wrapper.js";

export type IteratorHelperState = {
  method: "map" | "filter" | "take" | "drop" | "flatMap";
  status: "start" | "executing" | "yield" | "done";
  outer?: IteratorWrapperState;
  inner?: IteratorWrapperState;
  callback: SandboxValue;
  remaining: number;
  index: number;
};
export const iteratorHelperStates = new WeakMap<object, IteratorHelperState>();
