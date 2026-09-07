import type { SandboxClosure } from "./values.js";

// Original intrinsic aliases keep their registry even after property replacement.
export const symbolRegistryOrigins = new WeakMap<SandboxClosure, Map<string, symbol>>();
