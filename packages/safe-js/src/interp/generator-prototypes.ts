import type { Budget } from "./budget.js";
import type { SandboxObject } from "./values.js";

export const generatorPrototypes = new WeakMap<Budget, Map<boolean, {
  functionPrototype: SandboxObject;
  instancePrototype: SandboxObject;
}>>();
