import { createConsoleJsonGlobals } from "./globals/console-json.js";
import { createCollectionGlobals } from "./globals/collections.js";
import { createFloat32ArrayGlobal, createFloat32ArrayPrototypes } from "./globals/float32array.js";
import { createErrorGlobals, createErrorPrototypes } from "./globals/error.js";
import { createMathGlobals } from "./globals/math.js";
import { createRegexGlobals } from "./globals/regex.js";
import { createMiscGlobals } from "./globals/misc.js";
import { createUriGlobals } from "./globals/uri.js";
import { createObjectArrayGlobals } from "./globals/object-array.js";
import { createFunctionPrototype } from "./globals/function.js";
import { createGeneratorPrototypes } from "./globals/generator.js";
import { createPromiseGlobals } from "./promise.js";
import { createDateGlobal } from "./globals/date.js";
import { createSymbolGlobal } from "./globals/symbol.js";
import { createBigIntGlobal } from "./globals/bigint.js";
import { createArrayBufferGlobal } from "./globals/array-buffer.js";
import type { RunClock } from "../run.js";
import { registerBuiltinIdentities } from "./intrinsics.js";

export function createBuiltinBindings(
  options: Parameters<typeof createConsoleJsonGlobals>[0] & { random?: () => number; clock?: RunClock; functionHasInstance?: boolean; errorPrototypes?: boolean; float32Prototypes?: boolean }
) {
  const bindings = {
    ...createConsoleJsonGlobals(options),
    ...createCollectionGlobals(options),
    Float32Array: createFloat32ArrayGlobal(options.budget, options.float32Prototypes !== false),
    Date: createDateGlobal(options),
    Symbol: createSymbolGlobal(options.budget),
    BigInt: createBigIntGlobal(options.budget),
    ...createErrorGlobals({ ...options, errorPrototypes: options.errorPrototypes !== false }),
    ...createMathGlobals({ random: options.random, budget: options.budget }),
    ...createObjectArrayGlobals(options),
    ArrayBuffer: createArrayBufferGlobal(options.budget),
    ...createMiscGlobals(options),
    ...createUriGlobals(options.budget),
    ...createPromiseGlobals(options),
    ...createRegexGlobals(options)
  };
  createFunctionPrototype(options.budget, options.functionHasInstance);
  if (options.float32Prototypes !== false) createFloat32ArrayPrototypes(options.budget, bindings.Float32Array);
  if (options.errorPrototypes !== false) createErrorPrototypes(options.budget, bindings);
  createGeneratorPrototypes(options.budget);
  registerBuiltinIdentities(options.budget, bindings);
  return bindings;
}
