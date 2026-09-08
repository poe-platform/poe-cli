import type { Budget } from "../budget.js";
import { readPropertyDescriptor } from "../accessors.js";
import { invokeBuiltinClosure } from "../builtin-call.js";
import { createDataCheckpoint } from "../data-checkpoint.js";
import { ordinaryHasInstance } from "../instanceof.js";
import { registerBuiltinIdentities, resolveIntrinsicIdentity } from "../intrinsics.js";
import { iteratorWrapperStates } from "../iterator-wrapper.js";
import { createIntrinsicObject, getSandboxPropertyDescriptor, materializeFunctionProperties, registerIntrinsicFunction, registerIntrinsicObject, setSandboxPrototype } from "../object-model.js";
import { retainValues } from "../resources.js";
import { createSandboxClosure, isSandboxClosure, type SandboxCallContext, type SandboxClosure, type SandboxObject, type SandboxValue } from "../values.js";

export function installIteratorFrom(constructor: SandboxClosure, budget: Budget): void {
  const prototype: SandboxObject = createIntrinsicObject();
  setSandboxPrototype(prototype, resolveIntrinsicIdentity(budget, '["%IteratorPrototype%"]'));
  for (const name of ["next", "return"] as const) {
    Object.defineProperty(prototype, name, {writable:true,configurable:true,value:createSandboxClosure({
      guest:true,sandbox:true,name,length:0,call:async (_args,context)=>{
        const receiver=context?.thisValue;
        const state=receiver !== null && typeof receiver === "object" ? iteratorWrapperStates.get(receiver) : undefined;
        if (state === undefined) throw new TypeError("Iterator wrapper method requires a branded receiver.");
        const method=name === "next" ? state.next : await read(state.iterator,"return",context);
        if (name === "return" && (method === undefined || method === null)) return {value:undefined,done:true};
        if (!isSandboxClosure(method)) throw new TypeError("Iterator method must be callable.");
        return invokeBuiltinClosure(method,[],budget,context,state.iterator);
      }
    })});
  }
  const from=createSandboxClosure({guest:true,sandbox:true,name:"from",length:1,call:async ([input],context)=>{
    if (input === null || (typeof input !== "object" && typeof input !== "string"))
      throw new TypeError("Iterator.from requires an object or string.");
    let iterator: SandboxValue=input;
    let next: SandboxValue;
    const release=retainValues(budget,()=>[input,iterator,next]);
    try {
      const method=await read(input,Symbol.iterator,context);
      if (method !== undefined && method !== null) {
        if (!isSandboxClosure(method)) throw new TypeError("Symbol.iterator must be callable.");
        iterator=await invokeBuiltinClosure(method,[],budget,context,input);
      }
      if (iterator === null || typeof iterator !== "object") throw new TypeError("Iterator must be an object.");
      next=await read(iterator,"next",context);
      if (await ordinaryHasInstance(iterator,constructor,budget,context)) return iterator;
      const wrapper: SandboxObject=Object.create(null);
      iteratorWrapperStates.set(wrapper,{iterator,next});
      setSandboxPrototype(wrapper,prototype,budget);
      createDataCheckpoint(budget,context)(wrapper,0,true);
      return wrapper;
    } finally {release()}
  }});
  Object.defineProperty(materializeFunctionProperties(constructor),"from",{value:from,writable:true,configurable:true});
  registerBuiltinIdentities(budget,{Iterator:constructor,"%WrapForValidIteratorPrototype%":prototype});
  registerIntrinsicFunction(budget,from);
  registerIntrinsicObject(budget,prototype);

  async function read(value: SandboxValue,key: PropertyKey,context?: SandboxCallContext): Promise<SandboxValue> {
    if (context?.getProperty !== undefined) return context.getProperty(value,key);
    const descriptor=getSandboxPropertyDescriptor(value,key,budget);
    return descriptor === undefined ? undefined : readPropertyDescriptor(descriptor,value,context);
  }
}
