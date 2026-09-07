import { expect, it } from "vitest";
import { Budget } from "../interp/budget.js";
import { createPendingPromiseCapability } from "../interp/promise.js";
import { unrepresentedPromiseContinuations } from "../interp/promise-tracker.js";
import { inMemoryRunSnapshots, serializeSafeJSSnapshot } from "./dump-format.js";

it("keeps unresolved replay metadata exclusive to trusted in-memory snapshots", () => {
  const {promise} = createPendingPromiseCapability(new Budget());
  unrepresentedPromiseContinuations.add(promise);
  const snapshot = {sourceHash: "source", promise};
  expect(() => serializeSafeJSSnapshot(snapshot)).toThrow("unrepresented promise continuation");
  inMemoryRunSnapshots.add(snapshot);
  expect(() => serializeSafeJSSnapshot(snapshot)).not.toThrow();
  expect(() => serializeSafeJSSnapshot({...snapshot, trustedRunReplay: true}))
    .toThrow("unrepresented promise continuation");
});
