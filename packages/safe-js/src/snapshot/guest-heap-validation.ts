import { Budget } from "../interp/budget.js";
import { sandboxErrorNames, type SandboxErrorName } from "../error/shape.js";
import { createRawJson } from "../interp/raw-json.js";
import { createBuiltinBindings } from "../interp/globals.js";
import { getIntrinsicIdentity, listIntrinsicIdentities, resolveIntrinsicIdentity } from "../interp/intrinsics.js";
import { releaseObjectPrototype } from "../interp/object-model.js";
import { isSandboxClosure } from "../interp/values.js";
import { assertSnapshotDataDepth } from "../graph-depth.js";
import { validateStringIteratorState } from "../interp/string-iterator.js";

let intrinsicKinds: Map<string, boolean> | undefined;

function intrinsicCatalogue(): Map<string, boolean> {
  if (intrinsicKinds !== undefined) return intrinsicKinds;
  const budget = new Budget();
  try {
    createBuiltinBindings({ budget });
    const kinds = new Map<string, boolean>();
    for (const id of listIntrinsicIdentities(budget)) {
      const value = resolveIntrinsicIdentity(budget, id);
      if (getIntrinsicIdentity(value) === id) kinds.set(id, isSandboxClosure(value));
    }
    intrinsicKinds = kinds;
    return kinds;
  } finally { releaseObjectPrototype(budget); }
}

function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Expected a guest heap record.");
  return value as Record<string, unknown>;
}

function fields(value: Record<string, unknown>, required: string[], optional: string[] = []): void {
  if (required.some(key => !Object.hasOwn(value, key)) || Reflect.ownKeys(value).some(key =>
    typeof key !== "string" || (!required.includes(key) && !optional.includes(key)) ||
    !("value" in Object.getOwnPropertyDescriptor(value, key)!))) throw new TypeError("Invalid guest heap fields.");
}

function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new TypeError("Expected a guest heap array.");
  return value;
}

function integer(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new TypeError("Invalid guest heap index.");
  return value;
}

function absent(value: unknown): boolean {
  if (value === null || typeof value !== "object") return false;
  const node = record(value);
  return node.kind === "undefined" && Object.keys(node).length === 1;
}

export function validateGuestHeapNode(raw: unknown, heap: Record<string, unknown>, maxArrayLength = 0xffffffff): boolean {
  const node = record(raw);
  if (node.kind === "module-namespace") {
    fields(node,["kind","entries"]);
    const entries = array(node.entries);
    if (entries.length > maxArrayLength) throw new TypeError("Module namespace exceeds allocation limit.");
    const names = new Set<string>();
    for (const rawEntry of entries) {
      const entry = array(rawEntry);
      if (entry.length !== 2 || typeof entry[0] !== "string" || names.has(entry[0]))
        throw new TypeError("Invalid module namespace export.");
      names.add(entry[0]);
    }
    return true;
  }
  if (node.kind === "raw-json") {
    fields(node, ["kind", "text"]);
    if (typeof node.text !== "string") throw new TypeError("Invalid raw JSON source.");
    createRawJson(node.text);
    return true;
  }
  if (!["capability-executor", "promise-aggregate", "aggregate-entry", "aggregate-handler", "intrinsic", "bound-function", "promise-resolver", "pending-promise", "promise-reaction", "promise-adoption", "adoption-resolver", "guest-function", "guest-class", "guest-generator", "scope-frame", "guest-object", "guest-array", "guest-boxed", "guest-date", "guest-regex", "guest-promise", "array-iterator", "string-iterator", "iterator-wrapper", "iterator-helper", "guest-collection-iterator", "guest-regexp-iterator", "map", "set"].includes(String(node.kind))) return false;
  const reference = (value: unknown, kinds?: string[]) => {
    const ref = record(value);
    fields(ref, ["kind", "id"]);
    if (ref.kind !== "ref" || integer(ref.id) < 1 || !Object.hasOwn(heap, String(ref.id))) throw new TypeError("Invalid guest heap reference.");
    const target = record(heap[String(ref.id)]);
    if (kinds !== undefined && !kinds.includes(String(target.kind))) throw new TypeError("Wrong guest heap reference kind.");
    return target;
  };
  const callable = (value: unknown) => {
    if (absent(value)) return;
    const target = reference(value, ["aggregate-handler", "capability-executor", "intrinsic", "bound-function", "promise-resolver", "guest-function", "guest-class"]);
    if (target.kind === "intrinsic" && intrinsicCatalogue().get(String(target.id)) !== true)
      throw new TypeError("Guest accessor reference is not callable.");
  };
  const privateIdentity = (value: unknown, expected?: string) => {
    const identity = reference(value, ["object"]);
    fields(identity, ["kind", "entries"]);
    const entries = record(identity.entries);
    fields(entries, ["description"]);
    if (typeof entries.description !== "string" || entries.description.length === 0 ||
        (expected !== undefined && entries.description !== expected)) throw new TypeError("Invalid private-name identity.");
  };
  const privateState = (value: unknown, methodsOnly = false) => {
    const names = new Set<number>();
    for (const raw of array(value)) {
      const element = record(raw);
      fields(element, element.kind === "accessor" ? ["name", "kind", "get", "set"] : ["name", "kind", "value"]);
      privateIdentity(element.name);
      const id = integer(record(element.name).id);
      if (names.has(id)) throw new TypeError("Duplicate private element.");
      names.add(id);
      if (element.kind === "accessor") { callable(element.get); callable(element.set); }
      else if (element.kind === "method") { if (absent(element.value)) throw new TypeError("Missing private method."); callable(element.value); }
      else if (element.kind !== "field" || methodsOnly) throw new TypeError("Invalid private element kind.");
    }
  };
  const state = (value: unknown) => {
    const object = record(value);
    fields(object, ["properties"], ["prototype", "privateElements"]);
    if (object.privateElements !== undefined) privateState(object.privateElements);
    if (Object.hasOwn(object, "prototype") && object.prototype !== null) reference(object.prototype);
    const properties = record(object.properties);
    fields(properties, ["properties", "extensible"]);
    if (typeof properties.extensible !== "boolean") throw new TypeError("Invalid guest extensibility.");
    const keys = new Set<string>();
    for (const rawEntry of array(properties.properties)) {
      const entry = array(rawEntry);
      if (entry.length !== 2) throw new TypeError("Invalid guest property entry.");
      let key: string;
      if (typeof entry[0] === "string") key = `string:${entry[0]}`;
      else {
        const symbol = reference(entry[0], ["symbol"]);
        key = symbol.wellKnown === undefined ? `symbol:${record(entry[0]).id}` : `well-known:${symbol.wellKnown}`;
      }
      if (keys.has(key)) throw new TypeError("Duplicate guest property key.");
      keys.add(key);
      const descriptor = record(entry[1]);
      if (descriptor.kind === "data") {
        fields(descriptor, ["kind", "value", "writable", "enumerable", "configurable"]);
        if (typeof descriptor.writable !== "boolean") throw new TypeError("Invalid guest writable flag.");
      } else if (descriptor.kind === "accessor") {
        fields(descriptor, ["kind", "get", "set", "enumerable", "configurable"]);
        callable(descriptor.get);
        callable(descriptor.set);
      } else throw new TypeError("Invalid guest descriptor kind.");
      if (typeof descriptor.enumerable !== "boolean" || typeof descriptor.configurable !== "boolean") throw new TypeError("Invalid guest descriptor flags.");
    }
  };
  if (Object.hasOwn(node, "producers")) {
    const producers = new Set<unknown>();
    for (const entry of array(node.producers)) {
      const producer = reference(entry, ["promise-reaction"]);
      const capabilityOwner = producer.capability === undefined ? undefined : reference(record(producer.capability).promise);
      const aggregateOwner = producer.aggregate === undefined ? undefined : reference(producer.aggregate);
      if (producers.has(producer) || (capabilityOwner !== node && aggregateOwner !== node))
        throw new TypeError("Invalid promise producer ownership.");
      producers.add(producer);
    }
  }
  if (node.kind === "map" || node.kind === "set") {
    fields(node, ["kind", node.kind === "map" ? "entries" : "values"], ["propertyState", "prototype", "privateElements"]);
    if (node.privateElements !== undefined) privateState(node.privateElements);
    state({ properties: Object.hasOwn(node, "propertyState") ? node.propertyState : { properties: [], extensible: true },
      ...(Object.hasOwn(node, "prototype") ? { prototype: node.prototype } : {}) });
    return false;
  }
  if (node.kind === "capability-executor") {
    fields(node, ["kind", "resolve", "reject", "state"]);
    state(node.state);
  } else if (node.kind === "promise-aggregate") {
    fields(node, ["kind", "method", "capability", "values", "remaining", "size", "iteration"]);
    if (!["all", "allSettled", "race", "any"].includes(String(node.method))) throw new TypeError("Invalid promise aggregate method.");
    const size = integer(node.size);
    if (size > maxArrayLength || (node.iteration !== "complete" && node.iteration !== "abrupt")) throw new TypeError("Invalid promise aggregate iteration.");
    if (integer(node.remaining) > size + (node.iteration === "abrupt" ? 1 : 0)) throw new TypeError("Invalid promise aggregate remaining count.");
    reference(node.values, ["array", "guest-array"]);
    const capability = record(node.capability);
    fields(capability, ["promise", "resolve", "reject"]);
    if (absent(capability.resolve) || absent(capability.reject)) throw new TypeError("Missing promise aggregate resolver.");
    callable(capability.resolve);
    callable(capability.reject);
  } else if (node.kind === "aggregate-entry") {
    fields(node, ["kind", "aggregate", "index", "called"]);
    const aggregate = reference(node.aggregate, ["promise-aggregate"]);
    if (integer(node.index) >= integer(aggregate.size) || typeof node.called !== "boolean") throw new TypeError("Invalid promise aggregate entry.");
  } else if (node.kind === "aggregate-handler") {
    fields(node, ["kind", "entry", "action", "state"]);
    state(node.state);
    const entry = reference(node.entry, ["aggregate-entry"]);
    const aggregate = reference(entry.aggregate, ["promise-aggregate"]);
    if ((node.action !== "fulfilled" && node.action !== "rejected") ||
        (aggregate.method === "all" && node.action !== "fulfilled") ||
        (aggregate.method === "any" && node.action !== "rejected") || aggregate.method === "race")
      throw new TypeError("Invalid promise aggregate handler action.");
  } else if (node.kind === "promise-adoption") {
    fields(node, ["kind", "owner", "source"]);
    const owner = reference(node.owner, ["pending-promise"]);
    if (reference(owner.adoption, ["promise-adoption"]) !== node) throw new TypeError("Invalid promise adoption owner.");
    const source = reference(node.source, ["pending-promise", "promise-reaction", "guest-promise"]);
    if (source === owner)
      throw new TypeError("A promise cannot adopt itself.");
    let matchingCallbacks = 0;
    for (const entry of array(source.reactions)) {
      const reaction = reference(entry, ["promise-reaction"]);
      const handlers = [reaction.onFulfilled, reaction.onRejected].map(value => {
        if (value === null || typeof value !== "object" || record(value).kind !== "ref") return undefined;
        const handler = reference(value);
        return handler.kind === "adoption-resolver" && reference(handler.bridge, ["promise-adoption"]) === node ? handler : undefined;
      });
      if (handlers.every(handler => handler === undefined)) continue;
      if (handlers[0]?.action !== "fulfilled" || handlers[1]?.action !== "rejected")
        throw new TypeError("Invalid promise adoption callbacks.");
      matchingCallbacks++;
    }
    if (matchingCallbacks !== 1) throw new TypeError("Invalid promise adoption callbacks.");
  } else if (node.kind === "adoption-resolver") {
    fields(node, ["kind", "bridge", "action"]);
    reference(node.bridge, ["promise-adoption"]);
    if (node.action !== "fulfilled" && node.action !== "rejected") throw new TypeError("Invalid adoption resolver action.");
  } else if (node.kind === "promise-resolver") {
    fields(node, ["kind", "promise", "state"], ["action"]);
    const target = reference(node.promise, ["guest-promise", "pending-promise"]);
    if ((target.kind === "pending-promise" || Object.hasOwn(node, "action")) && node.action !== "fulfilled" && node.action !== "rejected")
      throw new TypeError("Invalid promise resolver action.");
    state(node.state);
  } else if (node.kind === "pending-promise" || node.kind === "promise-reaction") {
    fields(node, node.kind === "pending-promise" ? ["kind", "reactions", "state"] : ["kind", "source", "onFulfilled", "onRejected", "reactions", "state"], node.kind === "pending-promise" ? ["adoption", "producers"] : ["capability", "aggregate", "producers"]);
    if (node.kind === "pending-promise" && Object.hasOwn(node, "adoption")) {
      const bridge = reference(node.adoption, ["promise-adoption"]);
      if (reference(bridge.owner, ["pending-promise"]) !== node) throw new TypeError("Invalid promise adoption owner.");
    }
    if (node.kind === "promise-reaction") {
      if (Object.hasOwn(node, "aggregate")) {
        const aggregate = reference(node.aggregate, ["pending-promise", "guest-promise", "promise-reaction"]);
        if (aggregate === node || !Array.isArray(aggregate.producers) || !aggregate.producers.some(entry => reference(entry, ["promise-reaction"]) === node))
          throw new TypeError("Invalid promise aggregate producer ownership.");
        for (const value of [node.onFulfilled, node.onRejected]) {
          if (absent(value)) continue;
          const handler = reference(value);
          let owner: Record<string, unknown> | undefined;
          if (handler.kind === "promise-resolver") owner = reference(handler.promise);
          else if (handler.kind === "aggregate-handler") {
            const entry = reference(handler.entry, ["aggregate-entry"]);
            const state = reference(entry.aggregate, ["promise-aggregate"]);
            owner = reference(record(state.capability).promise);
          }
          if (owner !== undefined && owner !== aggregate) throw new TypeError("Invalid promise aggregate handler ownership.");
        }
      }
      if (Object.hasOwn(node, "capability")) {
        const capability = record(node.capability);
        fields(capability, ["promise", "resolve", "reject"]);
        const result = reference(capability.promise, ["pending-promise", "guest-promise", "promise-reaction"]);
        if (result === node) throw new TypeError("Invalid promise producer ownership.");
        if (!Array.isArray(result.producers) || !result.producers.some(entry => reference(entry, ["promise-reaction"]) === node))
          throw new TypeError("Unlisted promise producer.");
        if (absent(capability.resolve) || absent(capability.reject)) throw new TypeError("Missing promise producer resolver.");
        callable(capability.resolve);
        callable(capability.reject);
      }
      const source = reference(node.source, ["pending-promise", "promise-reaction", "guest-promise"]);
      if (!Array.isArray(source.reactions) || !source.reactions.some(entry => reference(entry, ["promise-reaction"]) === node))
        throw new TypeError("Unlisted promise reaction.");
    }
    if (!Array.isArray(node.reactions)) throw new TypeError("Invalid promise reactions.");
    const reactions = new Set<unknown>();
    for (const entry of node.reactions) {
      const reaction = reference(entry, ["promise-reaction"]);
      if (reactions.has(reaction)) throw new TypeError("Duplicate promise reaction.");
      if (reference(reaction.source) !== node) throw new TypeError("Invalid promise reaction source.");
      reactions.add(reaction);
    }
    state(node.state);
  } else if (node.kind === "guest-promise") {
    fields(node, ["kind", "status", "value", "state"], ["reactions", "producers"]);
    if (Object.hasOwn(node, "reactions")) {
      if (!Array.isArray(node.reactions)) throw new TypeError("Invalid promise reactions.");
      const reactions = new Set<unknown>();
      for (const entry of node.reactions) {
        const reaction = reference(entry, ["promise-reaction"]);
        if (reactions.has(reaction) || reference(reaction.source) !== node) throw new TypeError("Invalid promise reaction source.");
        reactions.add(reaction);
      }
    }
    if (node.status !== "fulfilled" && node.status !== "rejected") throw new TypeError("Invalid guest promise settlement.");
    if (node.status === "fulfilled" && node.value !== null && typeof node.value === "object" &&
        record(node.value).kind === "ref" && reference(node.value) === node)
      throw new TypeError("A promise cannot fulfill with itself.");
    state(node.state);
  } else if (node.kind === "guest-regex") {
    fields(node, ["kind", "source", "flags", "state"]);
    if (typeof node.source !== "string" || typeof node.flags !== "string") throw new TypeError("Invalid guest RegExp payload.");
    state(node.state);
  } else if (node.kind === "guest-boxed" || node.kind === "guest-date") {
    fields(node, ["kind", "value", "state"]);
    if (node.kind === "guest-date") {
      if (typeof node.value !== "number" && record(node.value).kind !== "number") throw new TypeError("Invalid guest date time.");
    } else if (!["number", "string", "boolean"].includes(typeof node.value)) {
      const payload = record(node.value);
      if (payload.kind === "ref") reference(node.value, ["symbol"]);
      else if (payload.kind !== "number" && payload.kind !== "bigint") throw new TypeError("Invalid guest boxed payload.");
    }
    state(node.state);
  } else if (node.kind === "iterator-helper") {
    fields(node, ["kind", "method", "status", "callback", "remaining", "index", "state"], ["outer", "inner"]);
    if (!["map", "filter", "take", "drop", "flatMap"].includes(String(node.method)) ||
        !["start", "yield", "done"].includes(String(node.status))) throw new TypeError("Invalid iterator helper mode.");
    integer(node.index);
    if (node.remaining !== "Infinity" && (typeof node.remaining !== "number" || !Number.isInteger(node.remaining) || node.remaining < 0))
      throw new TypeError("Invalid iterator helper limit.");
    for (const key of ["outer", "inner"]) {
      if (!Object.hasOwn(node, key)) continue;
      const cursor = record(node[key]);
      fields(cursor, ["iterator", "next"]);
      const target = reference(cursor.iterator);
      if (target.kind === "symbol" || target.kind === "scope-frame") throw new TypeError("Invalid helper iterator.");
    }
    if ((node.status === "done") === Object.hasOwn(node, "outer") ||
        (Object.hasOwn(node, "inner") && (node.method !== "flatMap" || node.status !== "yield")))
      throw new TypeError("Invalid iterator helper cursor state.");
    if (node.status === "done" || node.method === "take" || node.method === "drop") {
      if (!absent(node.callback)) throw new TypeError("Unexpected iterator helper callback.");
    } else {
      if (absent(node.callback)) throw new TypeError("Missing iterator helper callback.");
      callable(node.callback);
    }
    state(node.state);
  } else if (node.kind === "iterator-wrapper") {
    fields(node,["kind","iterator","next","state"]);
    const iterator=reference(node.iterator);
    if (iterator.kind === "symbol" || iterator.kind === "scope-frame") throw new TypeError("Invalid wrapped iterator.");
    state(node.state);
  } else if (node.kind === "intrinsic") {
    fields(node, ["kind", "id"], ["state", "symbolRegistry"]);
    if (typeof node.id !== "string" || !intrinsicCatalogue().has(node.id)) throw new TypeError("Unknown intrinsic identity.");
    if (Object.hasOwn(node, "symbolRegistry")) {
      if (![JSON.stringify(["Symbol"]), JSON.stringify(["Symbol", "for"]), JSON.stringify(["Symbol", "keyFor"])].includes(node.id) || !Array.isArray(node.symbolRegistry))
        throw new TypeError("Invalid symbol registry owner.");
      const keys = new Set<string>();
      const symbols = new Set<unknown>();
      for (const entry of node.symbolRegistry) {
        if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== "string" || keys.has(entry[0]))
          throw new TypeError("Invalid symbol registry entry.");
        const symbol = reference(entry[1], ["symbol"]);
        if (symbol.wellKnown !== undefined || symbol.description !== entry[0] || symbols.has(symbol))
          throw new TypeError("Invalid registered symbol identity.");
        keys.add(entry[0]);
        symbols.add(symbol);
      }
    }
    if (Object.hasOwn(node, "state")) state(node.state);
  } else if (node.kind === "guest-regexp-iterator") {
    fields(node, ["kind", "matcher", "input", "exhausted", "state"], ["global", "unicode"]);
    if (typeof node.exhausted !== "boolean" || (typeof node.input !== "string" && !absent(node.input)))
      throw new TypeError("Invalid RegExp iterator state.");
    if ((Object.hasOwn(node, "global") || Object.hasOwn(node, "unicode")) &&
        (typeof node.global !== "boolean" || typeof node.unicode !== "boolean"))
      throw new TypeError("Invalid RegExp iterator modes.");
    if (absent(node.matcher)) {
      if (!node.exhausted) throw new TypeError("Live RegExp iterator requires a matcher.");
    } else {
      const matcher = reference(node.matcher);
      if (matcher.kind === "symbol" || matcher.kind === "scope-frame") throw new TypeError("Invalid RegExp iterator matcher.");
    }
    if (!node.exhausted && absent(node.input)) throw new TypeError("Live RegExp iterator requires input.");
    state(node.state);
  } else if (node.kind === "guest-collection-iterator") {
    fields(node, ["kind", "collectionKind", "method", "collection", "index", "exhausted", "state"]);
    if (!["map", "set"].includes(String(node.collectionKind)) || !["keys", "values", "entries"].includes(String(node.method)) || typeof node.exhausted !== "boolean")
      throw new TypeError("Invalid collection iterator state.");
    integer(node.index);
    if (absent(node.collection)) {
      if (!node.exhausted || node.index !== 0) throw new TypeError("Invalid exhausted collection iterator.");
    } else reference(node.collection, [String(node.collectionKind)]);
    state(node.state);
  } else if (node.kind === "string-iterator") {
    fields(node, ["kind", "input", "index", "state"]);
    const index = integer(node.index);
    if (typeof node.input !== "string" && !absent(node.input))
      throw new TypeError("Invalid String iterator state.");
    validateStringIteratorState({ input: typeof node.input === "string" ? node.input : undefined, index });
    state(node.state);
  } else if (node.kind === "array-iterator") {
    fields(node, ["kind", "source", "index", "method", "state"]);
    integer(node.index);
    if (!["keys", "values", "entries"].includes(String(node.method))) throw new TypeError("Invalid Array iterator method.");
    if (!absent(node.source)) {
      const source = reference(node.source);
      if (source.kind === "scope-frame" || source.kind === "symbol") throw new TypeError("Invalid Array iterator source.");
    }
    state(node.state);
  } else if (node.kind === "guest-object" || node.kind === "guest-array") {
    fields(node, ["kind", "state"], node.kind === "guest-array" ? ["templateNodeId", "templateOwner"] : ["errorType"]);
    if (Object.hasOwn(node, "errorType") && !sandboxErrorNames.includes(node.errorType as SandboxErrorName))
      throw new TypeError("Invalid guest error type.");
    if (Object.hasOwn(node, "templateOwner")) reference(node.templateOwner, ["guest-array"]);
    if (Object.hasOwn(node, "templateNodeId") && integer(node.templateNodeId) < 1)
      throw new TypeError("Invalid template source identity.");
    state(node.state);
    if (node.kind === "guest-array") {
      const properties = array(record(record(node.state).properties).properties).map(entry => array(entry));
      const length = properties.find(entry => entry[0] === "length");
      if (length === undefined) throw new TypeError("Missing guest array length.");
      const descriptor = record(length[1]);
      if (descriptor.kind !== "data" || descriptor.configurable !== false || descriptor.enumerable !== false ||
          integer(descriptor.value) > 0xffffffff) throw new TypeError("Invalid guest array length.");
      if ((descriptor.value as number) > maxArrayLength) throw new TypeError("Guest array length exceeds allocation limit.");
      for (const [key] of properties) {
        if (typeof key !== "string") continue;
        const index = Number(key);
        if (Number.isInteger(index) && index >= 0 && index < 0xffffffff && String(index) === key &&
            index >= (descriptor.value as number)) throw new TypeError("Guest array index exceeds length.");
      }
    }
  } else if (node.kind === "guest-class") {
    fields(node, ["kind", "astNodeId", "scope", "state", "fields"], ["name", "privateMethods"]);
    if (node.privateMethods !== undefined) privateState(node.privateMethods, true);
    if (integer(node.astNodeId) < 1) throw new TypeError("Invalid class AST identity.");
    reference(node.scope, ["scope-frame"]);
    if (Object.hasOwn(node, "name") && typeof node.name !== "string") throw new TypeError("Invalid class name.");
    let previous = -1;
    for (const item of array(node.fields)) {
      const field = record(item);
      fields(field, ["index", "key"], ["privateName"]);
      if (field.privateName !== undefined) {
        if (typeof field.key !== "string" || !field.key.startsWith("#")) throw new TypeError("Invalid private field key.");
        privateIdentity(field.privateName, field.key.slice(1));
      }
      const index = integer(field.index);
      if (index <= previous) throw new TypeError("Invalid class field order.");
      previous = index;
      if (typeof field.key !== "string") reference(field.key, ["symbol"]);
    }
    state(node.state);
    const prototype = array(record(record(node.state).properties).properties).map(item => array(item)).find(entry => entry[0] === "prototype");
    if (prototype === undefined) throw new TypeError("Missing class prototype descriptor.");
    const descriptor = record(prototype[1]);
    if (descriptor.kind !== "data" || descriptor.writable !== false || descriptor.enumerable !== false || descriptor.configurable !== false)
      throw new TypeError("Invalid class prototype descriptor.");
    reference(descriptor.value, ["object", "guest-object"]);
  } else if (node.kind === "bound-function") {
    fields(node, ["kind", "target", "thisValue", "args", "length", "state"], ["name"]);
    if (Object.hasOwn(node, "name") && typeof node.name !== "string") throw new TypeError("Invalid bound function name.");
    if (array(node.args).length > maxArrayLength) throw new TypeError("Bound arguments exceed allocation limit.");
    if (!absent(node.length) && !(typeof node.length === "number" && node.length >= 0) &&
        !(record(node.length).kind === "number" && record(node.length).value === "Infinity"))
      throw new TypeError("Invalid bound function length.");
    const visited = new Set<unknown>([raw]);
    let current = node;
    while (current.kind === "bound-function") {
      assertSnapshotDataDepth(visited.size, "<bound-target>");
      callable(current.target);
      current = reference(current.target);
      if (visited.has(current)) throw new TypeError("Cyclic bound function target.");
      visited.add(current);
    }
    state(node.state);
  } else if (node.kind === "guest-function") {
    fields(node, ["kind", "astNodeId", "scope", "state"], ["name", "environment"]);
    if (integer(node.astNodeId) < 1) throw new TypeError("Invalid guest AST identity.");
    reference(node.scope, ["scope-frame"]);
    if (Object.hasOwn(node, "name") && typeof node.name !== "string") throw new TypeError("Invalid guest function name.");
    if (Object.hasOwn(node, "environment")) {
      const environment = record(node.environment);
      fields(environment, [], ["homeObject", "newTarget"]);
      if (Object.hasOwn(environment, "homeObject")) reference(environment.homeObject);
      if (Object.hasOwn(environment, "newTarget")) callable(environment.newTarget);
    }
    state(node.state);
  } else if (node.kind === "guest-generator") {
    fields(node, ["kind", "state", "astNodeId", "async", "scope", "closureScope", "sent"], ["suspendedScope", "yieldNodeId", "environment", "blockScopes", "finallyCompletions", "expressionStates", "objectState"]);
    if (Object.hasOwn(node, "objectState")) state(node.objectState);
    if (!["start", "running", "suspended", "done"].includes(String(node.state)) || typeof node.async !== "boolean" || integer(node.astNodeId) < 1)
      throw new TypeError("Invalid generator state.");
    reference(node.scope, ["scope-frame"]);
    reference(node.closureScope, ["scope-frame"]);
    if (Object.hasOwn(node, "suspendedScope")) reference(node.suspendedScope, ["scope-frame"]);
    if (Object.hasOwn(node, "blockScopes")) {
      for (const [id, scope] of Object.entries(record(node.blockScopes))) {
        if (integer(Number(id)) < 1 || String(Number(id)) !== id) throw new TypeError("Invalid generator block identity.");
        reference(scope, ["scope-frame"]);
      }
    }
    if (Object.hasOwn(node, "expressionStates")) {
      for (const [id, raw] of Object.entries(record(node.expressionStates))) {
        if (integer(Number(id)) < 1 || String(Number(id)) !== id) throw new TypeError("Invalid expression identity.");
        const expression = record(raw);
        if (expression.kind === "binary") {
          fields(expression, ["kind", "left"]);
        } else if (expression.kind === "declaration") {
          fields(expression, ["kind", "index"]);
          integer(expression.index);
        } else if (expression.kind === "pattern-source") {
          fields(expression, ["kind", "value"]);
        } else if (expression.kind === "object-pattern") {
          fields(expression, ["kind", "phase", "index", "excludedKeys", "key", "current"], ["referenceObject", "referenceKey", "privateName"]);
          if (expression.privateName !== undefined && (typeof expression.privateName !== "string" || !Object.hasOwn(expression, "referenceObject"))) throw new TypeError("Invalid private pattern reference.");
          integer(expression.index);
          if (!["key", "reference", "binding"].includes(String(expression.phase)) ||
              Object.hasOwn(expression, "referenceObject") !== Object.hasOwn(expression, "referenceKey")) throw new TypeError("Invalid object pattern state.");
          for (const key of array(expression.excludedKeys)) if (typeof key !== "string") reference(key, ["symbol"]);
          if (!absent(expression.key) && typeof expression.key !== "string") reference(expression.key, ["symbol"]);
          if (Object.hasOwn(expression, "referenceObject") && expression.phase !== "binding") throw new TypeError("Invalid prepared object pattern reference.");
          if (Object.hasOwn(expression, "referenceKey") && typeof expression.referenceKey !== "string") reference(expression.referenceKey, ["symbol"]);
        } else if (expression.kind === "for-of-array" || expression.kind === "for-of-iterator" || expression.kind === "array-pattern" || expression.kind === "yield-delegate") {
          if (expression.kind === "yield-delegate") {
            fields(expression, ["kind", "async", "value", "current", "iterator"]);
            if (typeof expression.async !== "boolean") throw new TypeError("Invalid delegated yield protocol.");
          } else if (expression.kind === "array-pattern") {
            fields(expression, ["kind", "phase", "index", "done", "current", "iterator"], ["referenceObject", "referenceKey", "privateName"]);
            if (expression.privateName !== undefined && (typeof expression.privateName !== "string" || !Object.hasOwn(expression, "referenceObject"))) throw new TypeError("Invalid private pattern reference.");
            if (!["reference", "binding"].includes(String(expression.phase)) || typeof expression.done !== "boolean" ||
                Object.hasOwn(expression, "referenceObject") !== Object.hasOwn(expression, "referenceKey")) throw new TypeError("Invalid array pattern state.");
            if (Object.hasOwn(expression, "referenceKey") && typeof expression.referenceKey !== "string") reference(expression.referenceKey, ["symbol"]);
          } else {
            fields(expression, ["kind", "phase", "current", "index", "scope",
            ...(expression.kind === "for-of-array" ? ["values"] : ["value", "iterator", "async"])]);
            if (!["left", "body"].includes(String(expression.phase))) throw new TypeError("Invalid for-of phase.");
            reference(expression.scope, ["scope-frame"]);
          }
          if (expression.kind !== "yield-delegate") integer(expression.index);
          if (expression.kind === "for-of-array") reference(expression.values, ["array", "guest-array"]);
          else {
            let iterator = record(expression.iterator);
            let depth = 0;
            let protocol = false;
            while (iterator.kind === "async-from-sync") {
              if (++depth > 1) throw new TypeError("Invalid nested async iterator adapter.");
              fields(iterator, ["kind", "inner"]);
              iterator = record(iterator.inner);
              protocol = true;
            }
            if (iterator.kind === "guest") {
              fields(iterator, ["kind", "value", "next", "async"]);
              if (typeof iterator.async !== "boolean") throw new TypeError("Invalid iterator protocol.");
              if (depth > 0 && iterator.async) throw new TypeError("Invalid async-from-sync source.");
              protocol ||= iterator.async;
              reference(iterator.value);
              callable(iterator.next);
            } else if (iterator.kind === "builtin") {
              fields(iterator, ["kind", "value", "index"]);
              integer(iterator.index);
              if (typeof iterator.value === "string" && (iterator.index as number) > iterator.value.length)
                throw new TypeError("Invalid string iterator cursor.");
              if (typeof iterator.value !== "string") {
                const target = reference(iterator.value, ["array", "guest-array", "map", "set", "guest-generator", "collection-iterator", "regexp-iterator"]);
                if (["guest-generator", "collection-iterator", "regexp-iterator"].includes(String(target.kind)) && iterator.index !== 0)
                  throw new TypeError("Invalid stateful iterator cursor.");
                if ((target.kind === "map" && (iterator.index as number) > array(target.entries).length) ||
                    (target.kind === "set" && (iterator.index as number) > array(target.values).length))
                  throw new TypeError("Invalid collection iterator cursor.");
                if (target.kind === "guest-generator" && target.async === true) {
                  if (depth > 0) throw new TypeError("Invalid async-from-sync generator.");
                  protocol = true;
                }
              }
            } else throw new TypeError("Invalid iterator continuation.");
            if ((expression.kind === "array-pattern" ? false : expression.async) !== protocol) throw new TypeError("Invalid iterator protocol.");
          }
        } else if (expression.kind === "for-in") {
          fields(expression, ["kind", "object", "keys", "index", "scope"], ["phase"]);
          if (Object.hasOwn(expression, "phase") && !["left", "body"].includes(String(expression.phase))) throw new TypeError("Invalid for-in phase.");
          if (array(expression.keys).some(key => typeof key !== "string") ||
              integer(expression.index) >= array(expression.keys).length) throw new TypeError("Invalid for-in continuation.");
          reference(expression.scope, ["scope-frame"]);
        } else if (expression.kind === "switch") {
          fields(expression, ["kind", "phase", "index", "statementIndex", "value", "scope"]);
          if (!["test", "body"].includes(String(expression.phase))) throw new TypeError("Invalid switch phase.");
          integer(expression.index);
          integer(expression.statementIndex);
          if (expression.phase === "test" && expression.statementIndex !== 0) throw new TypeError("Invalid switch test position.");
          reference(expression.scope, ["scope-frame"]);
        } else if (expression.kind === "for") {
          fields(expression, ["kind", "phase", "loopScope", "activeScope"]);
          if (!["init", "test", "body", "update"].includes(String(expression.phase))) throw new TypeError("Invalid for-loop phase.");
          reference(expression.loopScope, ["scope-frame"]);
          reference(expression.activeScope, ["scope-frame"]);
        } else if (expression.kind === "identifier-assignment") {
          fields(expression, ["kind", "current"]);
        } else if (expression.kind === "member-assignment") {
          fields(expression, ["kind", "object", "property", "current"], ["key", "superReceiver", "privateName"]);
          if (expression.privateName !== undefined && (typeof expression.privateName !== "string" || Object.hasOwn(expression, "key") || Object.hasOwn(expression, "superReceiver"))) throw new TypeError("Invalid private assignment reference.");
          if (Object.hasOwn(expression, "key") && typeof expression.key !== "string") reference(expression.key, ["symbol"]);
        } else if (expression.kind === "member") {
          fields(expression, ["kind", "object"], ["superReceiver"]);
        } else if (expression.kind === "template") {
          fields(expression, ["kind", "prefix", "index"]);
          integer(expression.index);
          if (typeof expression.prefix !== "string") throw new TypeError("Invalid template prefix.");
        } else if (expression.kind === "object") {
          fields(expression, ["kind", "value", "index"], ["key"]);
          integer(expression.index);
          reference(expression.value, ["object", "guest-object"]);
        } else if (expression.kind === "array") {
          fields(expression, ["kind", "values", "index"]);
          integer(expression.index);
          reference(expression.values, ["array", "guest-array"]);
        } else if (expression.kind === "call" || expression.kind === "new" || expression.kind === "tagged") {
          fields(expression, ["kind", "callee", "thisValue", "args", "index"]);
          integer(expression.index);
          reference(expression.args, ["array", "guest-array"]);
        } else if (expression.kind === "array-call") {
          fields(expression, ["kind", "target", "method", "args", "index"]);
          if (typeof expression.method !== "string") throw new TypeError("Invalid array method.");
          integer(expression.index);
          reference(expression.args, ["array", "guest-array"]);
          reference(expression.target, ["array", "guest-array"]);
        } else throw new TypeError("Invalid expression continuation.");
      }
    }
    if (Object.hasOwn(node, "finallyCompletions")) {
      for (const [id, raw] of Object.entries(record(node.finallyCompletions))) {
        if (integer(Number(id)) < 1 || String(Number(id)) !== id) throw new TypeError("Invalid finally identity.");
        const completion = record(raw);
        fields(completion, ["kind", "hasValue", "value"], ["nodeId", "label", "span", "stackFrames"]);
        if (!["normal", "return", "throw", "break", "continue"].includes(String(completion.kind)) || typeof completion.hasValue !== "boolean")
          throw new TypeError("Invalid finally completion.");
        if (Object.hasOwn(completion, "nodeId") && integer(completion.nodeId) < 1) throw new TypeError("Invalid completion node identity.");
        if (Object.hasOwn(completion, "label") && typeof completion.label !== "string") throw new TypeError("Invalid completion label.");
        if (Object.hasOwn(completion, "stackFrames") && array(completion.stackFrames).some(value => typeof value !== "string")) throw new TypeError("Invalid completion stack.");
      }
    }
    if (Object.hasOwn(node, "yieldNodeId") && integer(node.yieldNodeId) < 1) throw new TypeError("Invalid generator yield identity.");
    if (node.state === "suspended" && (!Object.hasOwn(node, "yieldNodeId") || !Object.hasOwn(node, "suspendedScope"))) throw new TypeError("Missing suspended generator state.");
    for (const rawCompletion of array(node.sent)) {
      const completion = record(rawCompletion);
      fields(completion, ["type", "value"]);
      if (!["normal", "return", "throw"].includes(String(completion.type))) throw new TypeError("Invalid generator completion type.");
    }
    if (Object.hasOwn(node, "environment")) {
      const environment = record(node.environment);
      fields(environment, [], ["homeObject", "newTarget"]);
      if (Object.hasOwn(environment, "homeObject")) reference(environment.homeObject);
      if (Object.hasOwn(environment, "newTarget")) callable(environment.newTarget);
    }
  } else {
    fields(node, ["kind", "parent", "importMeta", "functionBoundary", "chargeData", "bindings", "cells"], ["restoredBindings", "privateNames"]);
    if (node.privateNames !== undefined) {
      const names = new Set<string>();
      for (const raw of array(node.privateNames)) {
        const entry = array(raw);
        if (entry.length !== 2 || typeof entry[0] !== "string" || names.has(entry[0])) throw new TypeError("Invalid private-name scope.");
        names.add(entry[0]);
        privateIdentity(entry[1], entry[0]);
      }
    }
    if (!absent(node.parent)) reference(node.parent, ["scope-frame"]);
    if (typeof node.functionBoundary !== "boolean" || typeof node.chargeData !== "boolean") throw new TypeError("Invalid guest frame flags.");
    const cells = array(node.cells);
    for (const rawCell of cells) {
      const cell = record(rawCell);
      if (typeof cell.initialized !== "boolean" || !["var", "let", "const"].includes(String(cell.kind))) throw new TypeError("Invalid guest binding cell.");
      fields(cell, cell.initialized ? ["kind", "initialized", "value"] : ["kind", "initialized"]);
    }
    const names = new Set<string>();
    const used = new Set<number>();
    for (const rawBinding of array(node.bindings)) {
      const binding = array(rawBinding);
      if (binding.length !== 2 || typeof binding[0] !== "string" || names.has(binding[0])) throw new TypeError("Invalid guest binding name.");
      const id = integer(binding[1]);
      if (id >= cells.length) throw new TypeError("Unknown guest binding cell.");
      names.add(binding[0]); used.add(id);
    }
    if (used.size !== cells.length) throw new TypeError("Unreferenced guest binding cell.");
    if (Object.hasOwn(node, "restoredBindings")) {
      if (!absent(node.parent)) throw new TypeError("Only root scopes own pending restored bindings.");
      const restoredNames = new Set<string>();
      for (const rawBinding of array(node.restoredBindings)) {
        const binding = array(rawBinding);
        if (binding.length !== 2 || typeof binding[0] !== "string" || restoredNames.has(binding[0])) throw new TypeError("Invalid restored binding.");
        restoredNames.add(binding[0]);
      }
    }
  }
  return true;
}

export function validateGuestHeapGraphs(heap: Record<string, unknown>): void {
  for (const [kind, edge, message] of [
    ["scope-frame", "parent", "Cyclic guest scope parent graph."],
    ["promise-reaction", "source", "Cyclic promise reaction source graph."]
  ] as const) {
    const finished = new Set<string>();
    for (const [id, raw] of Object.entries(heap)) {
      if (record(raw).kind !== kind || finished.has(id)) continue;
      const path = new Set<string>();
      let current: string | undefined = id;
      while (current !== undefined && !finished.has(current)) {
        if (path.has(current)) throw new TypeError(message);
        const node = record(heap[current]);
        if (node.kind !== kind) break;
        path.add(current);
        const parent: unknown = node[edge];
        current = absent(parent) ? undefined : String(record(parent).id);
      }
      for (const visited of path) finished.add(visited);
    }
  }
}
