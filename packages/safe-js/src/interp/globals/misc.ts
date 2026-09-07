import type { Budget } from "../budget.js";
import { createNumericParsers } from "./numeric-parsers.js";
import { sandboxNumber } from "../string-coercion.js";
import { createStructuredCloneGlobal } from "./structured-clone.js";
import {
  createSandboxClosure,
  type SandboxClosure
} from "../values.js";

export type MiscGlobals = {
  structuredClone: SandboxClosure;
  parseInt: SandboxClosure;
  parseFloat: SandboxClosure;
  isNaN: SandboxClosure;
  isFinite: SandboxClosure;
};

export function createMiscGlobals(options: { budget: Budget }): MiscGlobals {
  return {
    structuredClone: createStructuredCloneGlobal(options.budget),
    ...createNumericParsers(options.budget),
    isNaN: createSandboxClosure({
      sandbox: true,
      call: ([value], context) => {
        const number = sandboxNumber(value, options.budget, context);
        return typeof number === "number" ? Number.isNaN(number) : number.then(Number.isNaN);
      },
      name: "isNaN"
    }),
    isFinite: createSandboxClosure({
      sandbox: true,
      call: ([value], context) => {
        const number = sandboxNumber(value, options.budget, context);
        return typeof number === "number" ? Number.isFinite(number) : number.then(Number.isFinite);
      },
      name: "isFinite"
    })
  };
}
