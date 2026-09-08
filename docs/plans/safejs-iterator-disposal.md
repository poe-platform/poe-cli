# Iterator disposal protocols

## Validated gaps

A built-runtime comparison with Node 24.14 found Iterator.prototype[Symbol.dispose] and the async-generator inherited Symbol.asyncDispose method missing in SafeJS. They are separate delivery steps, each with its own tests, commit, push, and release tracking.

## Synchronous iterator disposal

Follow [Iterator.prototype Symbol.dispose](https://tc39.es/ecma262/multipage/control-abstraction-objects.html#sec-iterator.prototype-%symbol.dispose%). The method reads return for each call, invokes a callable method with the original receiver and no arguments, ignores the result, and returns undefined. Missing/nullish methods are no-ops. Borrowed receivers need no iterator brand. Nullish receivers, non-callable methods, getters, and method exceptions retain normal property-access and call behavior.

Seven new tests failed before implementation; the eighth negative control already reported TypeError when the method itself was absent. All eight pass after installing the intrinsic on the shared iterator prototype, including generator cleanup through DisposableStack, descriptors, inherited array-iterator identity, and an escaped-method JSON snapshot after prototype mutation.

Focused verification passed all 1,831 tests across 53 iterator, generator, interpreter, and disposable-stack files. Changed-file lint passed. The selected workspace build passed its 23-workspace closure and four fresh-import checks. A Node 18.18 built-runtime probe closed a suspended generator through DisposableStack and confirmed its completion state.

The async iterator method remains unfinished. It must return a promise, await the return method's result, preserve failures, and survive snapshots while pending.
