import { assert, expect, it } from "vitest";
import { run } from "../run.js";
import { Budget } from "./budget.js";
import { invokeBuiltinClosure } from "./builtin-call.js";
import { awaitSandboxValue } from "./cancel.js";
import { createSandboxClosure, getPromiseProperties, isSandboxClosure, isSandboxPromise, measureSandboxData } from "./values.js";
import { attachPendingPromiseReaction, createPendingPromiseCapability } from "./promise.js";
import { promiseContinuations, promiseReactionResults, promiseAdoptions, promiseAdoptionBridges, promiseAdoptionResolvers } from "./promise-continuations.js";

it("records pending capabilities and their reaction links, then releases settled metadata", async () => {
  const result = await run("const c=Promise.withResolvers();const handler=value=>value+1;return [c.promise,c.resolve,c.promise.then(handler),handler]");
  assert(result.ok && Array.isArray(result.returnValue));
  const [promise, resolve, chained, handler] = result.returnValue;
  assert(isSandboxPromise(promise) && isSandboxPromise(chained) && isSandboxClosure(resolve));
  expect(promiseContinuations.get(promise)).toMatchObject({kind: "capability", state: {promise, settled: false}});
  expect(promiseContinuations.get(chained)).toMatchObject({kind: "reaction", source: promise, onFulfilled: handler});
  expect(promiseReactionResults.get(promise)?.has(chained)).toBe(true);
  const budget = new Budget();
  await invokeBuiltinClosure(resolve, [7], budget, undefined, undefined);
  expect(await awaitSandboxValue(chained, undefined, budget)).toBe(8);
  expect(promiseContinuations.has(promise)).toBe(false);
  expect(promiseContinuations.has(chained)).toBe(false);
  expect(promiseReactionResults.get(promise)?.size ?? 0).toBe(0);
});

it.each(["source", "result"])("accounts for a pending reaction handler from its %s", async root => {
  const budget = new Budget();
  const source = createPendingPromiseCapability(budget);
  const result = createPendingPromiseCapability(budget);
  const payload = {text: ""};
  const handler = createSandboxClosure({sandbox: true, retainedValues: () => [payload], call: () => 7});
  attachPendingPromiseReaction(source.promise, result, handler, undefined, budget);
  const promise = root === "source" ? source.promise : result.promise;
  const before = measureSandboxData([promise]);
  payload.text = "x".repeat(400);
  expect(measureSandboxData([promise]) - before).toBe(400);
  await invokeBuiltinClosure(source.resolve, [7], budget, undefined, undefined);
  expect(await awaitSandboxValue(result.promise, undefined, budget)).toBe(7);
  expect(measureSandboxData([promise])).toBeLessThan(before + 400);
});

it("accounts for the source retained by a locked adoption", async () => {
  const budget = new Budget();
  const owner = createPendingPromiseCapability(budget);
  const source = createPendingPromiseCapability(budget);
  const properties = getPromiseProperties(source.promise);
  Object.defineProperty(properties, "payload", {value: "", writable: true, configurable: true});
  await invokeBuiltinClosure(owner.resolve, [source.promise], budget, undefined, undefined);
  const before = measureSandboxData([owner.promise]);
  Object.defineProperty(properties, "payload", {value: "x".repeat(400)});
  expect(measureSandboxData([owner.promise]) - before).toBe(400);
  await invokeBuiltinClosure(source.resolve, [7], budget, undefined, undefined);
  expect(await awaitSandboxValue(owner.promise, undefined, budget)).toBe(7);
});

it("records the locked resolution input while adoption is pending", async () => {
  const result = await run("const first=Promise.withResolvers();const second=Promise.withResolvers();first.resolve(second.promise);first.resolve(99);return [first.promise,second.promise,second.resolve]");
  assert(result.ok && Array.isArray(result.returnValue));
  const [first, second, resolve] = result.returnValue;
  assert(isSandboxPromise(first) && isSandboxPromise(second) && isSandboxClosure(resolve));
  expect(promiseContinuations.get(first)).toMatchObject({kind: "capability", state: {settled: true}, resolution: {status: "fulfilled", value: second}});
  const token = promiseAdoptions.get(first);
  assert(token !== undefined);
  const bridge = promiseAdoptionBridges.get(token);
  assert(bridge !== undefined);
  expect(bridge.source).toBe(second);
  expect(bridge.owner).toBe(first);
  expect(bridge.settled).toBe(false);
  expect(promiseAdoptionResolvers.get(bridge.resolve)).toEqual({bridge: token, action: "fulfilled"});
  expect(promiseAdoptionResolvers.get(bridge.reject)).toEqual({bridge: token, action: "rejected"});
  expect(Object.keys(token)).toEqual([]);
  const budget = new Budget();
  await invokeBuiltinClosure(resolve, [7], budget, undefined, undefined);
  expect(await awaitSandboxValue(first, undefined, budget)).toBe(7);
  expect(promiseAdoptions.has(first)).toBe(false);
  expect(promiseAdoptionBridges.has(token)).toBe(false);
  expect(promiseAdoptionResolvers.has(bridge.resolve)).toBe(false);
  expect(promiseAdoptionResolvers.has(bridge.reject)).toBe(false);
});
