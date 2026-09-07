import type { ClassElement, ClassNode } from "../parse.js";
import { getFunctionLength } from "../parse/bindings.js";
import { functionSources } from "../parse/function-source.js";
import { accessorAdapter } from "./accessors.js";
import { createInterpretedClosure, executeClosure, type AsyncEvaluationContext, type AsyncEvaluationResult, type EvaluateAsyncNode } from "./async.js";
import { retainValues } from "./resources.js";
import { getSandboxPrototype, materializeFunctionProperties, setSandboxPrototype } from "./object-model.js";
import { defineDataProperty } from "./globals/object-array.js";
import { createCoercionContext, createPatternContext } from "./interpreter.js";
import type { Scope } from "./scope.js";
import { addPrivateElement, type PrivateName, type PrivateElement } from "./private-state.js";
import { hoistVarDeclarations } from "./var-hoist.js";
import { propertyFunctionName } from "./property-key.js";
import { createSandboxClosure, type SandboxCallContext, type SandboxClosure, type SandboxObject, type SandboxValue, isSandboxClosure } from "./values.js";

export type Field = { element: Extract<ClassElement, { type: "PropertyDefinition" }>; key: string | symbol; privateName?: PrivateName };
type StaticElement = Field | { element: Extract<ClassElement, { type: "StaticBlock" }> };

export async function evaluateClass(
  node: ClassNode,
  context: AsyncEvaluationContext,
  evaluateNode: EvaluateAsyncNode,
  callContext: SandboxCallContext
): Promise<AsyncEvaluationResult> {
  const scope = context.scope.child();
  if (node.id !== undefined) scope.predeclare(node.id.name, "const");
  const classContext = { ...context, scope, inferredName: undefined };
  let parent: SandboxValue;
  let prototypeParent: SandboxValue;
  const fields: Field[] = [];
  const statics: StaticElement[] = [];
  let constructor: SandboxClosure | undefined;
  const release = retainValues(context.budget, () => [parent, prototypeParent, constructor, ...fields.map(field => field.key), ...statics.flatMap(field => "key" in field ? [field.key] : [])]);
  try {
    if (node.superClass !== undefined) {
      const result = await evaluateNode(node.superClass, classContext);
      if (result.kind !== "normal") return result;
      parent = result.value;
      if (parent !== null && (!isSandboxClosure(parent) || parent.construct === undefined))
        throw new TypeError("Class extends value is not a constructor or null.");
      prototypeParent = parent === null ? null : await callContext.getProperty!(parent, "prototype");
      if (prototypeParent !== null && typeof prototypeParent !== "object")
        throw new TypeError("Class extends value has an invalid prototype.");
    }
    const derived = node.superClass !== undefined;
    for (const element of node.body.body)
      if (element.type !== "StaticBlock" && element.key.type === "PrivateIdentifier") scope.declarePrivateName(element.key.name);
    constructor = createClassConstructor(node, { ...classContext, inferredName: context.inferredName }, evaluateNode, fields);
    const instancePrivate = classOrigins.get(constructor)!.privateMethods;
    const staticPrivate = new Map<PrivateName, PrivateElement>();
    const properties = materializeFunctionProperties(constructor);
    const prototype = properties.prototype as SandboxObject;
    Object.defineProperty(properties, "prototype", { writable: false });
    if (derived) setSandboxPrototype(prototype, prototypeParent as object | null, context.budget);
    if (isSandboxClosure(parent)) setSandboxPrototype(constructor, parent, context.budget);

    const pattern = createPatternContext(classContext, scope, evaluateNode);
    for (const element of node.body.body) {
      context.budget.visitNode();
      if (element.type === "StaticBlock") {
        statics.push({ element });
        continue;
      }
      if (element.type === "MethodDefinition" && element.kind === "constructor") continue;
      let key: string | symbol;
      const privateName = element.key.type === "PrivateIdentifier" ? scope.resolvePrivateName(element.key.name) : undefined;
      if (element.computed) {
        const result = await evaluateNode(element.key, classContext);
        if (result.kind !== "normal") return result;
        key = await pattern.toPropertyKey(result.value);
      } else {
        key = privateName !== undefined ? `#${privateName.description}` : element.key.type === "Identifier" ? element.key.name : String((element.key as { value: string | number }).value);
      }
      if (typeof key === "string") context.budget.allocateString(key);
      if (element.type === "PropertyDefinition") {
        (element.static ? statics : fields).push({ element, key, ...(privateName === undefined ? {} : { privateName }) });
      } else {
        const home = element.static ? constructor : prototype;
        const method = createInterpretedClosure(element.value, classContext, evaluateNode, home);
        const accessor = element.kind === "get" || element.kind === "set" ? element.kind : undefined;
        Object.defineProperty(materializeFunctionProperties(method), "name", {
          value: accessor === undefined ? propertyFunctionName(key) : `${accessor} ${propertyFunctionName(key)}`
        });
        if (privateName !== undefined) {
          const entries = element.static ? staticPrivate : instancePrivate;
          if (accessor === undefined) entries.set(privateName, { kind: "method", value: method });
          else {
            let entry = entries.get(privateName);
            if (entry === undefined) { entry = { kind: "accessor" }; entries.set(privateName, entry); }
            if (entry.kind !== "accessor") throw new TypeError("Invalid private accessor declaration.");
            entry[accessor] = method;
          }
          continue;
        }
        Object.defineProperty(
          element.static ? properties : prototype,
          key,
          accessor === undefined
            ? { value: method, configurable: true, writable: true, enumerable: false }
            : { [accessor]: accessorAdapter(method, accessor), configurable: true, enumerable: false }
        );
      }
    }
    if (node.id !== undefined) scope.declare(node.id.name, "const", constructor);
    for (const [name, element] of staticPrivate) addPrivateElement(constructor, name, element);
    for (const element of statics) await initializeElement(element, constructor, constructor, classContext, evaluateNode);
    classOrigins.get(constructor)!.initialized = true;
    if (node.type === "ClassDeclaration") {
      context.scope.declare(node.id.name, "let", constructor);
      return { kind: "normal", hasValue: false, value: undefined };
    }
    return { kind: "normal", hasValue: true, value: constructor };
  } finally {
    release();
  }
}

export type ClassOrigin = { node: ClassNode; scope: Scope; fields: Field[]; initialized: boolean; privateMethods: Map<PrivateName, PrivateElement> };
export const classOrigins = new WeakMap<object, ClassOrigin>();

export function createClassConstructor(
  node: ClassNode,
  context: AsyncEvaluationContext,
  evaluateNode: EvaluateAsyncNode,
  fields: Field[]
): SandboxClosure {
  const scope = context.scope;
  const classContext = { ...context, inferredName: undefined };
  const constructorElement = node.body.body.find((element): element is Extract<ClassElement, { type: "MethodDefinition" }> => element.type === "MethodDefinition" && element.kind === "constructor");
  const derived = node.superClass !== undefined;
  const constructor = createSandboxClosure({
    guest: true,
    sandbox: true,
    name: node.id?.name ?? context.inferredName ?? "",
    length: constructorElement === undefined ? 0 : getFunctionLength(constructorElement.value.params),
    sourceRange: functionSources.get(node),
    retainedValues: () => {
      const values: SandboxValue[] = [...scope.retainedValues(), ...fields.flatMap(field => field.privateName === undefined ? [field.key] : [field.key, field.privateName])];
      for (const [name, element] of classOrigins.get(constructor)?.privateMethods ?? []) {
        values.push(name);
        if (element.kind === "accessor") values.push(element.get, element.set);
        else values.push(element.value);
      }
      return values;
    },
    call: () => { throw new TypeError("Class constructor cannot be invoked without 'new'."); },
    construct: async (args, invocation) => {
      const prototype = materializeFunctionProperties(constructor).prototype as SandboxObject;
      const newTarget = invocation?.newTarget ?? constructor!;
      let thisValue: SandboxValue;
      let thisScope: Scope | undefined;
      let initialized = !derived;
      const initializeFields = async (receiver: SandboxValue) => {
        for (const [name, element] of classOrigins.get(constructor)!.privateMethods) addPrivateElement(receiver, name, element);
        for (const field of fields) {
          await initializeElement(field, receiver, prototype, classContext, evaluateNode);
        }
      };
      const superCall = async (argumentsList: readonly SandboxValue[]) => {
        // SuperConstructor is read at invocation time, not captured at definition.
        const superConstructor = getSandboxPrototype(constructor!, context.budget);
        if (!isSandboxClosure(superConstructor) || superConstructor.construct === undefined)
          throw new TypeError("Super constructor is not a constructor.");
        const receiver = await invocation!.invokeClosure!(superConstructor, argumentsList, undefined, true, newTarget);
        if (initialized) throw new ReferenceError("Super constructor may only initialize this once.");
        initialized = true;
        thisValue = receiver;
        thisScope?.declare("this", "const", receiver);
        await initializeFields(receiver);
        return receiver;
      };
      if (!derived) {
        thisValue = {};
        const targetPrototype = await invocation!.getProperty!(newTarget, "prototype");
        if (typeof targetPrototype === "object" && targetPrototype !== null)
          setSandboxPrototype(thisValue, targetPrototype, context.budget);
      }
      if (constructorElement === undefined) {
        if (derived) return superCall(args);
        await initializeFields(thisValue);
        return thisValue;
      }
      const result = await executeClosure(constructorElement.value, args, thisValue, {
        ...classContext,
        compilation: invocation?.compilation ?? context.compilation,
        callStack: [...(invocation?.stack ?? context.callStack)],
        functionEnvironment: {
          newTarget,
          homeObject: prototype,
          construction: {
            derived,
            superCall,
            initialize: async (functionScope) => {
              thisScope = functionScope;
              if (!derived) await initializeFields(thisValue);
            }
          }
        }
      }, evaluateNode);
      if (typeof result === "object" && result !== null) return result;
      if (derived && result !== undefined) throw new TypeError("Derived constructors may only return an object or undefined.");
      if (!initialized) throw new ReferenceError("Must call super constructor before returning from derived constructor.");
      return thisValue;
    }
  });

  classOrigins.set(constructor, { node, scope, fields, initialized: false, privateMethods: new Map() });
  return constructor;
}

async function initializeElement(
  definition: StaticElement,
  receiver: SandboxValue,
  homeObject: SandboxObject | SandboxClosure,
  context: AsyncEvaluationContext,
  evaluateNode: EvaluateAsyncNode
): Promise<void> {
  const scope = context.scope.child({}, { functionBoundary: true });
  scope.declare("this", "const", receiver);
  const element = definition.element;
  const initializer = element.type === "StaticBlock" ? element.body : element.value;
  let value: SandboxValue;
  if (initializer !== undefined) {
    if (element.type === "StaticBlock") hoistVarDeclarations(element.body, scope);
    const result = await evaluateNode(initializer, { ...context, scope, functionEnvironment: { homeObject }, inferredName: "key" in definition ? propertyFunctionName(definition.key) : undefined });
    if (result.kind === "error") throw result.error;
    if (result.kind === "throw") throw result.value;
    value = result.hasValue ? result.value : undefined;
  }
  if ("key" in definition) {
    if (definition.privateName !== undefined) addPrivateElement(receiver, definition.privateName, { kind: "field", value });
    else await defineDataProperty(receiver, definition.key, { value, configurable: true, writable: true, enumerable: true }, context.budget, createCoercionContext(context));
  }
}
