# Issues 669 and 672: default portable entry integration

## Validated failures

The installed public candidate's complete portable preset failed an unshimmed
browser/workerd-conditions bundle on emitted crypto, stream, zlib and timer
imports. The existing published browser subset did not have the leak alleged in
issue 671; that issue was closed without a speculative fix.

The default-entry regression test first failed because the manifest still
required separate browser and portable aliases. Its RED output is retained in
`/tmp/kamilio-672-default-entry-red.log`. Component owners separately reproduced
their actual Node import failures before changing code.

## Integration

- The normal package specifier selects the full default command inventory under
  browser conditions, with a matching `core.d.ts` type surface. Browser and
  portable public subpath aliases and their command factories are removed as
  explicitly requested in issue 669's revised scope.
- An internal core barrel excludes host-only filesystem, HTTP and Node adapters.
  The existing Node root surface remains available, with native path semantics
  and the existing host exports. The explicit `/node` entry exposes the Node
  regex provider; `regexExecutor` injection is shared by default command factories.
- The maintained browser bundle has one canonical filesystem external and no
  external Node builtins. Existing bounded browser shell adaptation is retained;
  this does not turn unsupported regex modes into native fallbacks.
- Browser `posixPath` is the canonical filesystem's limited portable path helper;
  its declaration exposes only those supported methods. The Node root still
  exposes the complete native POSIX path API. No new compatibility shim pretends
  that the browser helper has the native process-dependent path API.
- Incremental hashes and bounded low-level compression use exact pinned portable
  dependencies. Private committed archive verification must authenticate their
  lock entries and actual offline package artifacts rather than silently using
  the checkout's installed dependency trees.
- Both runtime dependencies are also declared on the root package because its
  public `poe-code/safe-bash` Node entry includes the same unbundled modules.
  Relying on dev-only workspace dependencies would break an installed consumer.

## Guarded declaration admission

The real isolated private archive build reproduced TS2307 for both new libraries.
Six in-memory compiler controls reproduced missing declaration admission and
specified rejection of unapproved dependency names, changed pinned identities,
symlinked declarations and unrelated package imports. Before the change five
controls failed and the unrelated-import negative control passed. The complete
guarded-builder suite passes 130/130 after admitting only the two exact pinned
package roots, with existing declaration-only reads and physical identity guards
unchanged. Package metadata is bounded to 64 KiB. No broad node_modules admission
or compiler timeout increase is introduced.

The conditional export also reproduced a TypeError in the maintained typecheck
prerequisite checker, which assumed every target was a string. Its in-memory
regression verifies all nested browser/Node runtime and declaration targets,
preserves explicit null denials and wildcard routes, and fails if any concrete
target is missing. The focused regression passes after recursively collecting
the declared targets. This does not waive the later declaration-origin checks.

## Validation before delivery

Retain independent full command inventory, argument and filesystem identity,
pipeline, byte, cancellation and budget checks while migrating consumers to the
default entry. Run maintained build, lint and full unit routes for the integrated
cross-workspace change. Verify installed public packages under Node and Bun,
browser type conditions, and real workerd with no compatibility flags. Capture
and inspect a visual smoke result. Keep local commit, verified remote-main push
and successful release evidence separate.

## Integration findings on September 8

The complete maintained unit run exposed native-regex fixture helpers outside
the earlier test-file migration. The search stress workers, continuation child,
stdin/streaming/safety cases and adapter-tool fixtures now explicitly inject the
public Node provider. Native execution, cancellation and retirement assertions
remain unchanged; no native fallback is added to the portable default. These
helpers and the exact pinned dependency metadata assertion pass 214 focused
tests. The mktemp provenance control now checks the actual Web Crypto source
and exercises rejection sampling through mktemp itself; its seven controls and
four portable-random tests pass without weakening the host-I/O exclusions.

The same complete run found an original undefined source error being replaced
by AbortError inside archive compression. The unchanged error-identity test
reproduced it before repair; all 360 codec/archive/opaque-error cases now pass.
This runtime correction requires rebuilding and revalidating installed artifacts;
the earlier installed/workerd results do not qualify the changed codec. The full
run remains failed until all remaining isolated archive fixtures are repaired and
the complete maintained route passes again.

The first installed candidate passed the Node and Bun public smoke suites and
29 actual workerd cases with compatibility flags empty. Its graph contains 34
installed inputs, no external or Node edges, and no emitted imports. This is
intermediate evidence, not acceptance of a later rebuilt artifact.

Installed browser declaration checking found a Node-only filesystem option type
in the SafeJS runtime contract. Its required shape is just optional `cwd` and
`signal`; derive those fields from the portable filesystem bridge options rather
than exposing the Node bridge in the browser. Also check declarations with no
ambient Node types, preserving the complete Node path API through explicit Node
facades instead of silently narrowing existing Node consumers.

The maintained full test route found three root bundle assertions still naming
the removed entry files and one playground regex regression. Update the former
to the new internal entry. The playground already owns browser Worker adapters
and supports native regex modes; explicitly inject its existing adapted worker
provider rather than reducing its regex functionality to the new bounded default.
The root packaging checks then pass 39 tests and the full playground suite passes
166 tests, including worker cleanup and the original regex workflow. No native
fallback is added to the default public preset.

The visual smoke also reproduced a disabled playground terminal: Vite tried to
resolve a synthetic esbuild namespace as a watched physical file. A new focused
regression fails when the watch list includes that nonexistent path. Register
only physical graph inputs for file watching while retaining the full graph in
build evidence; keep explicit adapter watches. Repeat the real browser smoke
after the correction rather than treating the successful bundled kernel test as
proof that the interactive development server loads.

The initial full test route remains a recorded failure (20,240 passes, four
failures, one skip in the shared task); it is not a completed full-repository
pass. Repeat the maintained full route after integration is frozen, then rebuild,
pack, and re-admit the final installed artifact for browser and workerd checks.

The final installed browser smoke exposed one additional stale subset assertion:
it required all 79 commands to declare filesystem modes. The previous installed
full preset independently has exactly 31 declarations and 48 undeclared commands.
Preserve that exact declaration inventory and require undeclared support to stay
partial rather than inventing optimistic capabilities. The corrected browser
fixture passes against the unchanged final package tarballs. Installed Node and
Bun smoke and strict browser declarations without ambient Node types also pass.
Actual workerd acceptance for the final artifact passes all 29 cases; see the
separate installed-artifact validation document for hashes and cleanup evidence.
