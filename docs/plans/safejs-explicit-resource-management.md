# Explicit resource management gaps

## Current evidence

Built-runtime probes during SuppressedError validation returned `undefined` for DisposableStack, AsyncDisposableStack, Symbol.dispose, and Symbol.asyncDispose. Running `using value = null; return 1;` produced an unbound-identifier failure for `using`, rather than executing a resource declaration. This is incomplete language support, not a completed implementation.

Node 18.18 exposes native Symbol.dispose and Symbol.asyncDispose (with the historical `nodejs.dispose` description), so symbol-key host interoperability must be considered without raising the supported Node version.

## Delivery sequence

Use the current [ECMAScript resource-management definitions](https://tc39.es/ecma262/multipage/control-abstraction-objects.html#sec-disposablestack-objects) as the primary behavior reference.

1. Finish SuppressedError, including snapshots and host transport.
2. Add disposal well-known symbol identities and validate descriptors, host interoperability, and JSON snapshot identity.
3. Implement DisposableStack lifecycle, method capture, reverse-order disposal, move, disposed state, failure aggregation, receiver checks, and retention accounting.
4. Implement AsyncDisposableStack with awaited sequential cleanup and synchronous-disposer fallback.
5. Add using and await using declarations with lexical lifetime, abrupt-completion cleanup, iteration behavior, and correct suppressed-error chaining.

Each atomic improvement requires its own validated commit and push. Publication monitoring must not pause subsequent development.

## Cross-cutting requirements

Resource state cannot disappear across snapshots. A stack's brand, disposed state, captured methods/receivers, pending cleanup state, and resource aliases need explicit retention and serialization support. Do not substitute an enumerable backing array or a host-only closure that cannot be restored. Verify failures and disposal order, including throws during cleanup, reentrant disposal, repeated disposal, early return, and iterator exits. Unit tests must use in-memory resources and no external model calls.

This plan records remaining requirements; merely adding global names or successful no-resource examples does not satisfy them.

## Disposal-symbol delivery evidence

SuppressedError was delivered separately in `f02a7ee8f`. The disposal-symbol change adds both identities to the existing well-known-symbol table, so global descriptors, replay encoding, and full heap snapshots use the same canonical identities.

Before the change, five focused tests failed on missing identities and replay encoding. An additional host-compatibility test failed with both native symbol properties absent. The fallback uses Node's historical registry identities without installing properties on the host Symbol constructor. The guest registry remains isolated. Node introduced its disposal symbols in [18.18.0](https://nodejs.org/en/blog/release/v18.18.0) and [20.4.0](https://nodejs.org/en/blog/release/v20.4.0); the fallback covers earlier intermediate major versions allowed by the package engine range.

After the change, all 373 tests across 27 symbol and replay test files pass, including immutable global descriptors, host identity, isolated guest registries, JSON replay identity, full JSON snapshot aliases, and the absent-host-symbol case. Changed-file lint passes. DisposableStack, AsyncDisposableStack, and resource declarations remain separate, unfinished requirements.

The maintained selected-workspace build completed its 23-workspace dependency closure and all four fresh built-import checks. A built-runtime check on Node 18.18 passed both host identities and JSON replay round-trips.

## DisposableStack delivery evidence

The first nine lifecycle tests failed before the constructor existed. The candidate implements private branded resource records, captured receiver/method/arguments, LIFO cleanup, move, immutable constructor prototype, disposed accessor, reentrant and frozen disposal, callback validation, and intrinsic SuppressedError chaining. Separate failing tests exposed missing resource accounting, lost brands after JSON snapshots, and structured-clone ownership erasure; each now has explicit handling.

Private resources are charged by graph accounting and encoded as validated heap nodes. Active synchronous cleanup raises SnapshotNotReadyError so a live snapshot can wait for a serializable boundary instead of recording incomplete cleanup. A completed or moved stack retains its disposed state and aliases across restore. This does not implement AsyncDisposableStack or resource declarations.

One conformance edge deliberately follows the current specification rather than Node 24.14: AddDisposableResource receives the resource list before reading the disposer getter. If that getter calls move(), the later append belongs to the same list now owned by the moved stack. The candidate cleans up that resource; the installed Node 24.14 oracle drops it. See [AddDisposableResource](https://tc39.es/ecma262/multipage/abstract-operations.html#sec-adddisposableresource) and [DisposableStack.prototype.move](https://tc39.es/ecma262/multipage/control-abstraction-objects.html#sec-disposablestack.prototype.move). A getter that disposes its stack can also leave a disposed stack with retained resources, so snapshot validation must not invent a prohibition on that state.

Another observed JavaScript gap, outside this atomic change: assignment to built-in global bindings currently throws a const-binding error. Error aggregation is tested against lexical constructor shadowing without claiming mutable global bindings are implemented.

Verification: 59 focused checks passed with one existing skip. The full maintained SafeJS package unit route passed 19,770 tests with 41 skips across 651 passing files and one skipped file (384 seconds). Only the two already documented host-promise-property and weak-collection gap files were excluded; no new exclusions or timeout changes. Changed-file lint passed, and the selected 23-workspace build passed all four fresh built-import checks. Built-runtime cleanup passed on Node 18.18 and Node 20.0, including the latter's missing-native-symbol fallback without host-global mutations.

## Async implementation notes

The built candidate still returns `undefined` for `typeof AsyncDisposableStack`. A Node 24.14 control confirms that a synchronous fallback disposer returning a permanently pending promise does not hold up async cleanup, while the ordinary async callbacks are awaited sequentially. Calling disposeAsync with an invalid receiver returns a rejected promise rather than throwing synchronously.

Use the existing pending promise capabilities and represented reactions for cleanup continuation ownership. Retain and serialize the remaining resources, current failure, completion capability, and resume handler. Do not implement the async stack solely as a native async closure whose pending execution cannot survive snapshots. Capture nullish registrations because they can require an await turn even without a method. See [GetDisposeMethod](https://tc39.es/ecma262/multipage/abstract-operations.html#sec-getdisposemethod).

## AsyncDisposableStack delivery evidence

Six lifecycle tests initially failed on the missing global. The candidate adds a separate async brand, captured async/sync-fallback resources, sequential promise-based cleanup, suppressed-error chaining, move, nullish registrations, and rejected promises for invalid disposeAsync receivers. Repeated disposal returns a fresh fulfilled promise without waiting for the first pending disposal. Synchronous fallbacks ignore returned promises but translate synchronous throws into an awaited rejection.

Cleanup uses explicit state and generation-checked reaction handlers linked to its completion promise. Idle stacks, pending successful cleanup, and pending rejection after an earlier failure now round-trip through JSON snapshots. These three snapshot tests failed before private-state encoding was implemented. Active invocation phases defer snapshots; waiting phases are serializable.

Separate failing tests reproduced missing private-resource charges and structured-clone ownership erasure. Snapshot tampering tests also showed that redirected producer ownership and foreign promise resolvers were accepted; validation now checks both relationships. The maintained legacy graph tests enumerate the new global explicitly without changing their graph-comparison helper or fixtures.

The fatal-budget control uses an explicit `Budget({maxSteps:1000})` and verifies rejection with SandboxError. Earlier attempts mistakenly passed step limits through the unrelated RealmLimits option, leaving the test loop unbounded; those two test processes were stopped, and the test was corrected to use the maintained Budget API. No execution timeout was increased.

The selected-workspace build passed its 23-workspace closure and four fresh-import checks. Node 18.18 built-runtime checks passed sequential async disposal and the non-awaited synchronous fallback. A direct comparison with Node 24.14 produced identical disposer-prefix/caller/continuation ordering (`1, 2, 3`); that ordering is also covered by a maintained unit test.

Final verification: the full SafeJS package suite passed 19,787 tests with 41 skips across 654 passing files and one skipped file (389.5 seconds). Only the two documented host-promise-property and weak-collection gap files were excluded. Changed-file lint passed. A separate Node 18.18 built-runtime probe restored pending async cleanup from JSON and completed each disposer once in order.

## Resource-declaration integration still required

The parser's VariableDeclarationKind and declaration entry points currently accept only const/let/var. Both ordinary block evaluation and exception-block evaluation return abrupt completions directly, without lexical resource cleanup. Adding constructors does not address either gap.

Implement contextual using/await using grammar without making ordinary identifiers named using illegal. Enforce declaration early errors and immutable bindings, capture each disposer during binding initialization, and attach resource ownership to the lexical environment. Dispose on normal and abrupt exits, but not on a generator suspension. Restore ownership with suspended scopes and preserve the original completion when cleanup succeeds; combine errors when both the body and cleanup throw. Loop heads and iteration-local lifetime require their own tests. See [resource declarations](https://tc39.es/ecma262/multipage/ecmascript-language-statements-and-declarations.html#sec-let-and-const-declarations).

An additional built-runtime comparison found both `Iterator.prototype[Symbol.dispose]` and an async generator's inherited `Symbol.asyncDispose` method undefined in SafeJS, while Node 24.14 exposes both as functions. These iterator protocol methods need a separate validated improvement; stack constructors and declaration syntax alone will not provide standard iterator cleanup.
