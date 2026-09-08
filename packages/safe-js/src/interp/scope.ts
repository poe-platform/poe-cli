import type { VariableDeclarationKind } from "../parse.js";
import type { PrivateName } from "./private-state.js";
import type { InterpreterSnapshot, InterpreterValue } from "./interpreter.js";
import type { ResourceScopeState } from "./resource-management.js";
import { builtinGlobalObjects, getIntrinsicIdentity, mutableBuiltinBindings } from "./intrinsics.js";
import { getSandboxPropertyDescriptor } from "./object-model.js";
import type { SandboxObject } from "./values.js";
import type { ModuleEnvironment } from "../modules/registry.js";
import { scopeDataRoots } from "./scope-data-roots.js";

type ScopeBinding = {
  kind: VariableDeclarationKind;
  value: InterpreterValue | typeof uninitialized;
  accounting?: { value: InterpreterValue; root: SandboxObject };
};

type ScopeLookupResult =
  | {
      found: true;
      kind: VariableDeclarationKind;
      value: InterpreterValue;
      object?: SandboxObject;
    }
  | {
      found: false;
    };

const uninitialized = Symbol("uninitialized");

type ScopeOptions = {
  functionBoundary?: boolean;
  chargeData?: boolean;
};

export type ScopeFrame = {
  moduleEnvironment?: ModuleEnvironment;
  objectEnvironment?: SandboxObject;
  resourceState?: ResourceScopeState;
  privateNames?: Array<[string, PrivateName]>;
  parent?: Scope;
  importMeta?: InterpreterValue;
  functionBoundary: boolean;
  chargeData: boolean;
  bindings: Array<[string, number]>;
  cells: Array<{ kind: VariableDeclarationKind } & (
    { initialized: false } | { initialized: true; value: InterpreterValue }
  )>;
  restoredBindings?: Array<[string, InterpreterValue]>;
};

export class Scope {
  moduleEnvironment?: ModuleEnvironment;
  private objectEnvironment?: SandboxObject;
  resourceState?: ResourceScopeState;
  privateNames?: Map<string, PrivateName>;
  readonly #bindings = new Map<string, ScopeBinding>();
  readonly #replacedBindings = new Set<ScopeBinding>();
  readonly #restoredBindings: Map<string, InterpreterValue>;
  #frameHydrated = false;
  #bindingDataRoots?: SandboxObject[];

  constructor(
    bindings: Record<string, InterpreterValue> = {},
    private readonly parent?: Scope,
    private importMeta?: InterpreterValue,
    private readonly options: ScopeOptions = {
      functionBoundary: parent === undefined
    },
    restoredBindings?: Record<string, InterpreterValue>
  ) {
    this.#restoredBindings =
      parent === undefined
        ? new Map(Object.entries(restoredBindings ?? {}))
        : parent.#restoredBindings;
    const mutable = mutableBuiltinBindings.get(bindings);
    this.objectEnvironment = builtinGlobalObjects.get(bindings);
    for (const [name, value] of Object.entries(this.objectEnvironment === undefined ? bindings : {})) {
      this.#bindings.set(name, {
        kind: mutable?.has(name) ? "var" : "const",
        value
      });
    }
  }

  child(bindings: Record<string, InterpreterValue> = {}, options: ScopeOptions = {}): Scope {
    return new Scope(bindings, this, undefined, {
      chargeData: true,
      ...options
    });
  }

  declarePrivateName(description: string): PrivateName {
    const names = this.privateNames ??= new Map();
    const existing = names.get(description);
    if (existing !== undefined) return existing;
    const name = { description };
    names.set(description, name);
    return name;
  }

  resolvePrivateName(description: string): PrivateName {
    const ownName = this.privateNames?.get(description);
    if (ownName !== undefined) return ownName;
    let scope: Scope | undefined = this.parent;
    while (scope !== undefined) {
      const name = scope.privateNames?.get(description);
      if (name !== undefined) return name;
      scope = scope.parent;
    }
    throw new SyntaxError(`Undeclared private name #${description}.`);
  }

  consumeRestoredBinding(
    name: string
  ): { found: true; value: InterpreterValue } | { found: false } {
    if (!this.#restoredBindings.has(name)) {
      return { found: false };
    }

    const value = this.#restoredBindings.get(name);
    this.#restoredBindings.delete(name);
    return { found: true, value };
  }

  hasOwnBinding(name: string): boolean {
    return this.#bindings.has(name);
  }

  getOwnBindingKind(name: string): VariableDeclarationKind | undefined {
    return this.#bindings.get(name)?.kind;
  }

  isFunctionBoundary(): boolean {
    return this.options.functionBoundary === true;
  }

  iterationChild(names: readonly string[]): Scope {
    const scope = new Scope({}, this.parent);

    for (const name of names) {
      const binding = this.requireInitializedBinding(name);
      if (binding.kind === "var") {
        continue;
      }
      scope.declare(name, binding.kind, binding.value);
    }

    return scope;
  }

  lookupImportMeta(): InterpreterValue {
    if (this.importMeta !== undefined) {
      return this.importMeta;
    }

    if (this.parent !== undefined) {
      return this.parent.lookupImportMeta();
    }

    return {};
  }

  lookupThis(): InterpreterValue {
    const binding = this.#bindings.get("this");
    if (binding !== undefined) {
      if (binding.value === uninitialized) throw new ReferenceError("Cannot access 'this' before initialization.");
      return binding.value;
    }
    return this.parent?.lookupThis();
  }

  lookupModuleEnvironment(): ModuleEnvironment | undefined {
    return this.moduleEnvironment ?? this.parent?.lookupModuleEnvironment();
  }

  retainedValues(): InterpreterValue[] {
    const values = this.parent?.retainedValues() ?? [];
    if (this.moduleEnvironment !== undefined) values.push(...Object.values(this.moduleEnvironment.namespaces));
    if (this.resourceState !== undefined) values.push(this.resourceState);
    if (this.options.chargeData !== false) {
      if (this.importMeta !== undefined) values.push(this.importMeta);
      if (this.privateNames !== undefined) values.push(...this.privateNames.values());
      for (const binding of this.#bindings.values()) {
        if (binding.value !== uninitialized) values.push(binding.value);
      }
    } else {
      for (const binding of this.#replacedBindings) {
        if (binding.value !== uninitialized) values.push(binding.value);
      }
    }
    return values;
  }

  retainedDataRoots(): InterpreterValue[] {
    const values = this.parent?.retainedDataRoots() ?? [];
    if (this.moduleEnvironment !== undefined) values.push(...Object.values(this.moduleEnvironment.namespaces));
    if (this.resourceState !== undefined) values.push(this.resourceState);
    if (this.options.chargeData !== false) {
      if (this.importMeta !== undefined) values.push(this.importMeta);
      if (this.privateNames !== undefined) values.push(...this.privateNames.values());
    }
    if (this.#bindingDataRoots === undefined) {
      const roots: SandboxObject[] = [];
      const bindings = this.options.chargeData === false ? this.#replacedBindings : this.#bindings.values();
      for (const binding of bindings) {
        const value = binding.value;
        if (!isChargedBindingValue(value)) continue;
        if (binding.accounting === undefined) {
          const root = Object.freeze({});
          scopeDataRoots.set(root, {value});
          binding.accounting = {value, root};
        }
        roots.push(binding.accounting.root);
      }
      this.#bindingDataRoots = [];
      if (roots.length > 0) {
        const group = Object.freeze({});
        scopeDataRoots.set(group, {values: roots});
        this.#bindingDataRoots.push(group);
      }
    }
    values.push(...this.#bindingDataRoots);
    return values;
  }

  declare(name: string, kind: VariableDeclarationKind, value: InterpreterValue): void {
    const existing = this.#bindings.get(name);
    if (existing !== undefined && existing.value !== uninitialized) {
      throw new Error(`Cannot redeclare binding '${name}' in the same scope.`);
    }
    if (existing !== undefined && existing.kind !== kind) {
      throw new Error(`Cannot redeclare binding '${name}' in the same scope.`);
    }

    if (existing !== undefined) this.writeBindingValue(existing, value);
    else {
      this.#bindings.set(name, { kind, value });
      if (isChargedBindingValue(value)) this.#bindingDataRoots = undefined;
    }
  }

  declareAlias(name: string, target: string): void {
    if (this.#bindings.has(name)) throw new Error(`Cannot redeclare binding '${name}' in the same scope.`);
    const binding = this.#bindings.get(target);
    if (binding === undefined) throw new ReferenceError(`Identifier '${target}' is not defined.`);
    this.#bindings.set(name, binding);
  }

  declareVar(name: string): void {
    const boundary = this.options.functionBoundary === true ? this : this.parent;
    if (boundary === undefined) {
      throw new Error("Cannot declare var without a function boundary.");
    }
    if (boundary !== this) {
      boundary.declareVar(name);
      return;
    }

    const existing = this.#bindings.get(name);
    if (existing?.kind === "var") {
      return;
    }
    if (existing !== undefined) {
      throw new Error(`Cannot redeclare binding '${name}' in the same scope.`);
    }

    this.#bindings.set(name, {
      kind: "var",
      value: undefined
    });
  }

  predeclare(name: string, kind: VariableDeclarationKind): void {
    if (this.#bindings.has(name)) {
      throw new Error(`Cannot redeclare binding '${name}' in the same scope.`);
    }

    this.#bindings.set(name, {
      kind,
      value: uninitialized
    });
  }

  assign(name: string, value: InterpreterValue,
    setProperty?: (object: SandboxObject, key: string, value: InterpreterValue) => void | Promise<void>
  ): void | Promise<void> {
    const scope = this.resolveScope(name);
    if (scope === undefined) {
      if (name === "undefined") throw new TypeError("Cannot assign to const binding 'undefined'.");
      throw new ReferenceError(`Cannot assign to undeclared binding '${name}'.`);
    }

    if (!scope.#bindings.has(name) && scope.objectEnvironment !== undefined) {
      if (setProperty !== undefined) return setProperty(scope.objectEnvironment, name, value);
      const descriptor = getSandboxPropertyDescriptor(scope.objectEnvironment, name);
      if (descriptor === undefined) throw new ReferenceError(`Cannot assign to undeclared binding '${name}'.`);
      if (!("value" in descriptor)) throw new TypeError("Object environment accessors require a guest call context.");
      if (!Reflect.set(scope.objectEnvironment, name, value)) throw new TypeError(`Cannot assign to read-only binding '${name}'.`);
      return;
    }
    const binding = scope.#bindings.get(name);
    if (binding === undefined) {
      throw new ReferenceError(`Cannot assign to undeclared binding '${name}'.`);
    }

    if (binding.value === uninitialized) {
      throw new ReferenceError(`Cannot access '${name}' before initialization.`);
    }

    if (binding.kind === "const") {
      throw new TypeError(`Cannot assign to const binding '${name}'.`);
    }

    scope.writeBindingValue(binding, value);
    scope.trackReplacement(name, binding);
  }

  lookup(name: string): ScopeLookupResult {
    const binding = this.#bindings.get(name);
    if (binding !== undefined) {
      if (binding.value === uninitialized) {
        throw new ReferenceError(`Cannot access '${name}' before initialization.`);
      }

      return {
        found: true,
        kind: binding.kind,
        value: binding.value
      };
    }

    if (this.objectEnvironment !== undefined) {
      const descriptor = getSandboxPropertyDescriptor(this.objectEnvironment, name);
      if (descriptor !== undefined) return {found: true, kind: "var", value: descriptor.value, object: this.objectEnvironment};
    }
    if (this.parent !== undefined) {
      return this.parent.lookup(name);
    }

    // A virtual default also serves legacy snapshots without adding frame cells.
    if (name === "undefined") return { found: true, kind: "const", value: undefined };
    return { found: false };
  }

  snapshot(): InterpreterSnapshot {
    const scopes: Scope[] = [this];
    let parent = this.parent;

    while (parent !== undefined) {
      scopes.push(parent);
      parent = parent.parent;
    }

    const bindings: Record<string, InterpreterValue> = {};

    for (let index = scopes.length - 1; index >= 0; index -= 1) {
      const object = scopes[index].objectEnvironment;
      if (object !== undefined) {
        // Public dump discovery must still see builtin roots and mutations.
        // Accessors are captured through the object, never invoked by a dump.
        for (const [name, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(object))) {
          if ("value" in descriptor) defineSnapshotBinding(bindings, name, descriptor.value);
        }
      }
      for (const [name, binding] of scopes[index].#bindings.entries()) {
        if (binding.value === uninitialized) {
          continue;
        }

        defineSnapshotBinding(bindings, name, binding.value);
      }
    }

    return {
      bindings
    };
  }

  captureFrame(): ScopeFrame {
    const ids = new Map<ScopeBinding, number>();
    const cells: ScopeFrame["cells"] = [];
    const bindings: ScopeFrame["bindings"] = [];
    for (const [name, binding] of this.#bindings) {
      let id = ids.get(binding);
      if (id === undefined) {
        id = cells.length;
        ids.set(binding, id);
        cells.push(binding.value === uninitialized
          ? { kind: binding.kind, initialized: false }
          : { kind: binding.kind, initialized: true, value: binding.value });
      }
      bindings.push([name, id]);
    }
    return {
      parent: this.parent,
      ...(this.moduleEnvironment === undefined || this.moduleEnvironment.available.length === 0 ? {} : {moduleEnvironment: this.moduleEnvironment}),
      ...(this.objectEnvironment === undefined ? {} : {objectEnvironment: this.objectEnvironment}),
      importMeta: this.importMeta,
      functionBoundary: this.isFunctionBoundary(),
      chargeData: this.options.chargeData !== false,
      bindings,
      cells,
      ...(this.resourceState === undefined ? {} : {resourceState: this.resourceState}),
      ...(this.privateNames === undefined ? {} : { privateNames: [...this.privateNames] }),
      ...(this.parent === undefined ? { restoredBindings: [...this.#restoredBindings] } : {})
    };
  }

  hydrateFrame(frame: ScopeFrame): void {
    if (this.#frameHydrated || this.#bindings.size !== 0 || this.importMeta !== undefined ||
        (this.parent === undefined && this.#restoredBindings.size !== 0))
      throw new TypeError("Frame hydration requires a fresh scope.");
    if (frame.parent !== this.parent || frame.functionBoundary !== this.isFunctionBoundary() ||
        frame.chargeData !== (this.options.chargeData !== false))
      throw new TypeError("Scope frame does not match its allocation.");
    if (this.parent !== undefined && frame.restoredBindings !== undefined)
      throw new TypeError("Only root scopes own restored bindings.");
    const cells: ScopeBinding[] = frame.cells.map(cell => ({
      kind: cell.kind,
      value: cell.initialized ? cell.value : uninitialized
    }));
    const bindings = new Map<string, ScopeBinding>();
    const referenced = new Set<number>();
    for (const [name, id] of frame.bindings) {
      if (typeof name !== "string" || bindings.has(name) || !Number.isSafeInteger(id) || id < 0 || id >= cells.length)
        throw new TypeError("Invalid scope binding cell.");
      bindings.set(name, cells[id]);
      referenced.add(id);
    }
    if (referenced.size !== cells.length) throw new TypeError("Unreferenced scope binding cell.");
    const restored = new Map(frame.restoredBindings ?? []);
    if (restored.size !== (frame.restoredBindings?.length ?? 0)) throw new TypeError("Duplicate restored binding.");
    this.importMeta = frame.importMeta;
    this.moduleEnvironment = frame.moduleEnvironment;
    this.objectEnvironment = frame.objectEnvironment;
    this.resourceState = frame.resourceState;
    if (frame.privateNames !== undefined) this.privateNames = new Map(frame.privateNames);
    for (const [name, binding] of bindings) {
      this.#bindings.set(name, binding);
      this.trackReplacement(name, binding);
    }
    if (this.parent === undefined)
      for (const [name, value] of restored) this.#restoredBindings.set(name, value);
    this.#frameHydrated = true;
    this.#bindingDataRoots = undefined;
  }

  copyInitializedBindingsFrom(source: Scope, names: readonly string[]): void {
    for (const name of names) {
      const sourceBinding = source.requireInitializedBinding(name);
      const targetScope = this.resolveScope(name);
      if (targetScope === undefined) {
        this.declare(name, sourceBinding.kind, sourceBinding.value);
        continue;
      }

      const targetBinding = targetScope.#bindings.get(name)!;
      targetBinding.kind = sourceBinding.kind;
      targetScope.writeBindingValue(targetBinding, sourceBinding.value);
    }
  }

  private writeBindingValue(binding: ScopeBinding, value: InterpreterValue): void {
    if (!Object.is(binding.value, value)) {
      if (binding.accounting !== undefined || isChargedBindingValue(value)) this.#bindingDataRoots = undefined;
      // Release obsolete snapshots even without another accounting pass.
      binding.accounting = undefined;
    }
    binding.value = value;
  }

  private resolveScope(name: string): Scope | undefined {
    if (this.#bindings.has(name) || (this.objectEnvironment !== undefined &&
        getSandboxPropertyDescriptor(this.objectEnvironment, name) !== undefined)) {
      return this;
    }

    return this.parent?.resolveScope(name);
  }

  private trackReplacement(name: string, binding: ScopeBinding): void {
    if (this.options.chargeData !== false || binding.kind === "const") return;
    const value = binding.value;
    if (typeof value === "object" && value !== null && getIntrinsicIdentity(value) === JSON.stringify([name])) {
      if (this.#replacedBindings.delete(binding)) this.#bindingDataRoots = undefined;
    } else if (!this.#replacedBindings.has(binding)) {
      this.#replacedBindings.add(binding);
      this.#bindingDataRoots = undefined;
    }
  }

  private requireInitializedBinding(name: string): {
    kind: VariableDeclarationKind;
    value: InterpreterValue;
  } {
    const scope = this.resolveScope(name);
    const binding = scope === undefined ? undefined : scope.#bindings.get(name);

    if (binding === undefined) {
      throw new ReferenceError(`Identifier '${name}' is not defined.`);
    }

    if (binding.value === uninitialized) {
      throw new ReferenceError(`Cannot access '${name}' before initialization.`);
    }

    return {
      kind: binding.kind,
      value: binding.value
    };
  }
}

function isChargedBindingValue(value: ScopeBinding["value"]): value is InterpreterValue {
  return value !== uninitialized && value != null && typeof value !== "number" && typeof value !== "boolean";
}

function defineSnapshotBinding(
  target: Record<string, InterpreterValue>,
  name: string,
  value: InterpreterValue
): void {
  Object.defineProperty(target, name, {
    configurable: true,
    enumerable: true,
    value,
    writable: true
  });
}
