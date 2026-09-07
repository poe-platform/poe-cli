import { assert, expect, it } from "vitest";
import { run } from "../run.js";
import { Budget } from "../interp/budget.js";
import { invokeBuiltinClosure } from "../interp/builtin-call.js";
import { awaitSandboxValue } from "../interp/cancel.js";
import { isSandboxClosure, isSandboxPromise } from "../interp/values.js";
import { serialize, type RuntimeSnapshotValue } from "./serialize.js";

it.each([
  ["c.promise.constructor = {[Symbol.species]: P}; const result = c.promise.then(value=>value+1)", 8],
  ["const result = P.all([c.promise])", [7]],
  ["const result = Promise.all([c.promise])", [7]],
  ["const result = Promise.race([c.promise])", 7]
] as const)("does not silently omit unresolved custom capability callbacks: %s", async (expression, expected) => {
  const source = `const c=Promise.withResolvers();class P extends Promise{};${expression};Object.setPrototypeOf(result,Promise.prototype);return [result,c.resolve]`;
  const control = await run(source);
  assert(control.ok && Array.isArray(control.returnValue));
  const [promise, resolve] = control.returnValue;
  assert(isSandboxPromise(promise) && isSandboxClosure(resolve));
  const budget = new Budget();
  await invokeBuiltinClosure(resolve, [7], budget, undefined, undefined);
  expect(await awaitSandboxValue(promise, undefined, budget)).toEqual(expected);

  const fresh = await run(source);
  assert(fresh.ok && Array.isArray(fresh.returnValue));
  expect(() => serialize({source, currentAstNodeId: 1,
    scopeChain: [{id: "module", bindings: {promise: fresh.returnValue[0] as RuntimeSnapshotValue}}],
    callStack: [], pendingPromises: [], moduleBindings: {}}))
    .toThrow("Cannot serialize host reference");
});
