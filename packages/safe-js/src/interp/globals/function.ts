import type { Budget } from "../budget.js";
import { invokeBuiltinClosure } from "../builtin-call.js";
import { callFunctionMethod } from "../methods/function.js";
import { getSandboxPrototype, installFunctionPrototype, materializeFunctionProperties, setSandboxPrototype } from "../object-model.js";
import { createSandboxClosure } from "../values.js";

export function createFunctionPrototype(budget: Budget): void {
  const prototype = createSandboxClosure({ guest: true, sandbox: true, name: "", length: 0, call: () => undefined });
  const properties = materializeFunctionProperties(prototype);
  // Invocation support does not grant the host's dynamic source constructor.
  Object.defineProperty(properties, "constructor", { value: undefined, writable: true, configurable: true });
  for (const [name, length] of [["call", 1], ["apply", 2], ["bind", 1], ["toString", 0]] as const) {
    Object.defineProperty(properties, name, { writable: true, configurable: true,
      value: createSandboxClosure({ guest: true, sandbox: true, name, length,
        call: (args, context) => callFunctionMethod(context?.thisValue, name, args, {
          budget,
          callClosure: (target, values, stack, thisValue, construct, newTarget) =>
            context?.invokeClosure !== undefined
              ? context.invokeClosure(target, values, thisValue, construct, newTarget)
              : invokeBuiltinClosure(target, values, budget, { ...context, stack, thisValue, newTarget }, thisValue, construct)
        }, context?.stack ?? [], context)
      })
    });
  }
  setSandboxPrototype(prototype, getSandboxPrototype(Object.create(null), budget));
  installFunctionPrototype(budget, prototype);
}
