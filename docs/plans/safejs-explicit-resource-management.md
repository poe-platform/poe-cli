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
