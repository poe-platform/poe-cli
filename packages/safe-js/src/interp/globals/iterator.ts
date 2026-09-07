import type { Budget } from "../budget.js";
import { accessorAdapter, readPropertyDescriptor } from "../accessors.js";
import { createDataCheckpoint } from "../data-checkpoint.js";
import { resolveIntrinsicIdentity } from "../intrinsics.js";
import { setSandboxProperty } from "../interpreter.js";
import { getSandboxPropertyDescriptor, materializeFunctionProperties, registerIntrinsicFunction, registerIntrinsicObject, setSandboxPrototype } from "../object-model.js";
import { createSandboxClosure, defineOwnDataProperty, type SandboxClosure, type SandboxObject } from "../values.js";
import { objectProperties } from "./object-array.js";
import { installIteratorFrom } from "./iterator-from.js";
import { installIteratorConsumers } from "./iterator-consumers.js";

export function createIteratorGlobal(budget: Budget): SandboxClosure {
  const prototype = resolveIntrinsicIdentity(budget, '["%IteratorPrototype%"]') as SandboxObject;
  const constructor: SandboxClosure = createSandboxClosure({
    guest: true, sandbox: true, name: "Iterator", length: 0,
    call: () => { throw new TypeError("Iterator is an abstract constructor."); },
    construct: async (_args, context) => {
      const target = context?.newTarget;
      if (target === undefined || target === constructor)
        throw new TypeError("Iterator is an abstract constructor.");
      const parent = context?.getProperty !== undefined
        ? await context.getProperty(target, "prototype")
        : await readPropertyDescriptor(getSandboxPropertyDescriptor(target, "prototype", budget) ?? {value:undefined}, target, context);
      const instance: SandboxObject = Object.create(null);
      setSandboxPrototype(instance, parent !== null && typeof parent === "object" ? parent : prototype, budget);
      createDataCheckpoint(budget, context)(instance, 0, true);
      return instance;
    }
  });
  Object.defineProperty(materializeFunctionProperties(constructor), "prototype", {value:prototype,writable:false});
  const getter = createSandboxClosure({guest:true,sandbox:true,name:"get constructor",length:0,call:()=>constructor});
  const setter = createSandboxClosure({guest:true,sandbox:true,name:"set constructor",length:1,call:async ([value],context)=>{
    const receiver=context?.thisValue;
    if (receiver === prototype || receiver === null || typeof receiver !== "object")
      throw new TypeError("Iterator constructor setter requires a distinct object receiver.");
    const properties=objectProperties(receiver,true);
    if (Object.hasOwn(properties,"constructor")) await setSandboxProperty(receiver,"constructor",value,budget,true,context);
    else defineOwnDataProperty(properties,"constructor",value);
    createDataCheckpoint(budget,context)(receiver,0,true);
    return undefined;
  }});
  Object.defineProperty(prototype,"constructor",{get:accessorAdapter(getter,"get"),set:accessorAdapter(setter,"set"),configurable:true});
  registerIntrinsicFunction(budget,getter);
  registerIntrinsicFunction(budget,setter);
  installIteratorFrom(constructor,budget);
  installIteratorConsumers(prototype,budget);
  registerIntrinsicFunction(budget,constructor);
  registerIntrinsicObject(budget,prototype);
  return constructor;
}
