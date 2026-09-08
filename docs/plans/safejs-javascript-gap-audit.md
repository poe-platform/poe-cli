# JavaScript gap audit

## Current built-runtime evidence

This inventory was rechecked after remote-main commit
713e15dc94dd892a723aeac2ca115d588ad10069. The local build also contains
uncommitted weak collections. Presence in this
build is not proof of remote delivery or full conformance.

A clean Node 24.14.0 VM global-name comparison reports these absent guest names:
Function, Atomics, Proxy, FinalizationRegistry, WeakRef, eval, SharedArrayBuffer,
and WebAssembly. WebAssembly is a separate platform API. This is an omission
inventory, not an exhaustive list of semantic gaps.

| Area | Current evidence | Remaining work |
| --- | --- | --- |
| Function / eval | Missing bindings; earlier concrete calls failed | Guest-only dynamic compilation, direct/indirect scope rules, budgets and snapshots |
| Proxy | Missing binding | Traps, invariants, receiver behavior, metering and continuations |
| SharedArrayBuffer / Atomics | Missing bindings | Shared-memory ownership and scheduling semantics |
| WeakRef / FinalizationRegistry | Missing bindings | Reachability and cleanup scheduling with sandbox resource control |
| WeakMap / WeakSet | Local tests pass on Node 22; built Node 18 rejects valid symbol keys at WeakRef construction | Portable symbol lifetime semantics; feature remains uncommitted |
| RegExp.compile | Delivered in 713e15dc9; 415 regressions and Node 18/24 comparisons and replay pass | Publication pending; continue semantic auditing |
| RegExp legacy statics | Native constructor names absent in built guest | Validate matching-state behavior before implementation |
| Error diagnostic APIs | Native captureStackTrace, prepareStackTrace, stackTraceLimit absent | These are V8-specific APIs, not proof of a core-language omission |

The RegExp static-name comparison reports input, $_, lastMatch, $&, lastParen,
$+, leftContext, rightContext, their punctuation aliases, and $1 through $9.
Checking names does not establish the intended semantics or authorize importing
native global match state.

## Delivered capabilities that older notes incorrectly listed as missing

The built Intl namespace contains Locale, Collator, NumberFormat, ListFormat,
RelativeTimeFormat, DisplayNames, DateTimeFormat, PluralRules, Segmenter,
DurationFormat, getCanonicalLocales, and supportedValuesOf. All were delivered
by the verified SafeJS 0.1.470 publication. Presence and regression coverage do
not establish complete Intl conformance across locales and host ICU versions.

Other verified remote-main changes include:

- globalThis, dynamic import of registered modules, and guest host-function
  property mutation, delivered in earlier commits.
- Legacy escape/unescape, delivered in e520de3f8.
- Thirteen legacy String HTML methods, delivered in 7587264c1 and published
  in SafeJS 0.1.471.
- Symbol-accessor snapshot state, delivered in ac0a0036e and published in
  SafeJS 0.1.472.
- Four legacy Object accessor methods, delivered in 108c3a6fd.
- Guest __proto__ accessors, delivered in 314bb3455. The cumulative SafeJS
  0.1.473 publication includes the preceding Object accessor methods.
- Object property-key conversion order, delivered in 52df4a2ad; publication
  is still monitored separately.

A new native prototype-name comparison no longer reports the String HTML,
Object legacy accessor, __proto__, or RegExp.compile omissions. RegExp.compile
is verified on remote main but is not yet a verified publication.

## Open semantic and operational investigations

- Weak-symbol storage cannot be polyfilled by silently keeping a permanent
  strong-symbol table. Node 18 exposes no V8 weak-symbol feature flag in its
  option listing. Do not raise the declared Node minimum without authorization.
- Host Promise own-property import has unresolved admission-policy implications.
  Do not import private AsyncLocalStorage metadata or classify every omitted
  host capability as missing JavaScript.
- The camera fixture has reproduced CI timeouts. Earlier performance experiments
  and exact fixture/budget constraints remain in safejs-camera-ci-performance.md.
  Do not relax timeouts or shrink fixtures to claim success.
- Dynamic Function/eval design constraints remain in safejs-dynamic-functions.md.
- Older Intl investigations include Node 18 offset-timezone support and draft
  PluralRules notation options; revalidate concrete behavior before changing code.

## Completion and delivery boundaries

The overall four-day JavaScript-completeness objective remains open. These
inventories do not redefine it around the capabilities already implemented.
Further differential, resource-accounting, host-boundary, and snapshot testing
is required even for APIs whose names are present.

Each atomic improvement is committed and pushed independently. Local commit,
verified remote-main delivery, and successful publication are separate facts.
Workflow concurrency can cancel superseded runs; a trigger is not proof that
that commit received a distinct version. Monitor cumulative publication while
continuing validated issue work.

Do not treat process, require, Buffer, browser APIs, or network access as missing
core JavaScript capabilities. Do not expose them implicitly while adding a
language feature.
