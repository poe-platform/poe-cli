import { generatorIterator } from "../iteration.js";
import {
  allocateProducedSandboxValue,
  createSandboxClosure,
  createSandboxPromise,
  isSandboxGenerator,
  type SandboxCallContext,
  type SandboxGenerator,
  type SandboxValue
} from "../values.js";
import type { Budget } from "../budget.js";

const generatorMethodNames = new Set(["next", "return", "throw"] as const);
type GeneratorMethodName = "next" | "return" | "throw";

export function getGeneratorMember(
  target: SandboxGenerator,
  property: string | number,
  budget: Budget
): SandboxValue | undefined {
  if (typeof property !== "string" || !generatorMethodNames.has(property as GeneratorMethodName)) {
    return undefined;
  }

  return createSandboxClosure({
    sandbox: true,
    name: property,
    call: ([value], context) => callGeneratorMethod(target, property as GeneratorMethodName, value, budget, context, target.async === true)
  });
}

export function callGeneratorMethod(
  target: SandboxValue,
  method: GeneratorMethodName,
  value: SandboxValue,
  budget: Budget,
  context: SandboxCallContext | undefined,
  async: boolean
): SandboxValue | Promise<SandboxValue> {
  const result = (async () => {
    if (!isSandboxGenerator(target) || (target.async === true) !== async)
      throw new TypeError(`${async ? "AsyncGenerator" : "Generator"}.${method} requires a matching generator receiver.`);
    const iterator = generatorIterator(target, budget, context);
    const result = await iterator[method]!(value);
    return allocateProducedSandboxValue({ value: result.value, done: result.done === true }, budget);
  })();
  return async ? createSandboxPromise(result) : result;
}
