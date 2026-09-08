import type { Budget } from "../budget.js";
import { canonicalizeGuestLocales } from "../intl-options.js";
import { registerBuiltinIdentities } from "../intrinsics.js";
import { createIntrinsicObject, registerIntrinsicFunction, registerIntrinsicObject } from "../object-model.js";
import { sandboxString } from "../string-coercion.js";
import { allocateProducedSandboxValue, createSandboxClosure, type SandboxCallContext, type SandboxObject, type SandboxValue } from "../values.js";

const supportedValuesOf = Intl.supportedValuesOf;

export function createIntlGlobal(budget: Budget): SandboxObject {
  const methods: Record<string, (args: readonly SandboxValue[], context?: SandboxCallContext) => Promise<SandboxValue>> = {
    getCanonicalLocales: async ([locales], context) =>
      allocateProducedSandboxValue(await canonicalizeGuestLocales(locales, budget, context), budget),
    supportedValuesOf: async ([key], context) => {
      const text = await sandboxString(key, budget, context);
      budget.visitNode(text.length);
      return allocateProducedSandboxValue(supportedValuesOf(text as Parameters<typeof supportedValuesOf>[0]), budget);
    }
  };
  const intl = createIntrinsicObject();
  for (const [name, call] of Object.entries(methods)) {
    const closure = createSandboxClosure({ guest: true, sandbox: true, name, length: 1, call });
    Object.defineProperty(intl, name, { value: closure, writable: true, configurable: true });
  }
  Object.defineProperty(intl, Symbol.toStringTag, { value: "Intl", configurable: true });
  registerBuiltinIdentities(budget, { Intl: intl });
  for (const name of Object.keys(methods)) registerIntrinsicFunction(budget, intl[name] as ReturnType<typeof createSandboxClosure>);
  registerIntrinsicObject(budget, intl);
  return intl;
}
