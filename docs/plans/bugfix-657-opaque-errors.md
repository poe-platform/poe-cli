---
$schema: https://poe-platform.github.io/poe-code/schemas/plans/plan.schema.json
kind: plan
version: 1
readiness: draft
---

# #657 full-fix patch handoff

September 8, 2026. Canonical 49-path grant applied after rechecking all before
hashes; initial after-hashes also verified. Root owns Git, build, lint, full
gates and release. Host access is included. The subsequent authorized grep
catch fix and seven controls are canonical; no historical seals were changed.
Root subsequently granted compression/files.ts, diagnostic-display.test.ts and
safejs/lifecycle.test.ts: all three are now updated (52 product/test/docs targets
plus this plan). Final focused checks are GREEN; tools are frozen for root gates.

## Patch

- Applied initial payload: `/tmp/issue657-full-fix.apply.patch` (do not reapply).
- Unified review patch: `/tmp/issue657-full-fix.patch`.
- Exact path/hash manifest: `/tmp/issue657-inventory.json`.
- Candidate tree: `/tmp/issue657-work/candidate`; unchanged input snapshots:
  `/tmp/issue657-work/base` (materialization adds one trailing newline; manifest
  hashes and patches normalize it back to the actual original bytes).
- 49 exact targets, including source, contract documentation, one new
  typed test and its exact maintained discovery assertion. No shared safe-fs,
  structured #655, pattern algorithms, held copies or README edits.
- All 49 initial after-hashes matched after application. The authorized later
  edits to matching.ts and opaque-errors.test.ts intentionally supersede their
  candidate after-hashes. Runtime changes use narrow hunks, not replacement snapshots.

## Host hook and diagnostic policy

- `InternalErrorHandler = (error: unknown) => void | Promise<void>`;
  optional `onInternalError` on ShellOptions, ShellExecOptions and CommandContext.
  Per-exec setting overrides the shell default; nested runtimes share that exec's
  callback through the existing Budget. No result collection or new observer framework.
- Unexpected failures are reported synchronously at conversion to diagnostics,
  before safe output, with the original value including null/undefined/false/zero/
  empty string. Intermediate codec/worker wrappers retain the original in a
  private cause until conversion; no retained shell collection or deduplication set.
  Repeated conversions are separate events, even for the same error object.
- Callback throws and promise rejections are consumed, not recursively reported,
  printed or converted to statuses. Returned promises are observed but never
  awaited or enrolled in cleanup; host owns asynchronous logging delivery.
  A pending callback does not block exec/dispose. Synchronous host JS is not preempted.
- Caller cancellation, Flow/EPIPE, limits and cleanup keep their existing ordering
  and direct rejection identity, not spurious observer events. Callback-triggered
  caller cancellation follows normal subsequent checkpoints; tested with reason 0.
  Otherwise-swallowed diagnostic sink failures are observable without status change.
- Actual FsError public messages remain public and causes remain private/unchanged;
  they are not traversed or reported as new unknown errors. Other authored typed
  diagnostics stay public. Unknown errors project to `internal error`, without
  stringification or reading their messages/stacks. Public codec diagnostics are
  narrowly recognized before classification; source failures cannot acquire that permission.
- Projection precedes early family formatting, nested patch wrappers, runtime
  diagnostics, regex worker wrapping and SafeJS host-hook failure formatting.
  Explicit SafeJS guest-error results keep their guest contract, not host-fault status.
  This is accidental-disclosure defense, not isolation from hostile host JavaScript.

## Evidence

- Original 57 RED/control witnesses retained; opaque-errors total now **121**.
- Pre-fix baseline: **30 pass / 83 expected RED / exit 1**:
  `/tmp/issue657-full-baseline.log`.
- Candidate with promoted typed test: **113 pass / 0 fail / exit 0**:
  `/tmp/issue657-promoted-candidate.log`.
- Canonical grep pre-fix: **6 RED / 1 genuine SyntaxError control GREEN**:
  `/tmp/issue657-canonical-grep-red.log`. Catch now handles only SyntaxError;
  TypeError/false/null/0/empty/undefined propagate unchanged to the host hook.
- Canonical targeted suite: **120 pass / 0 fail / exit 0**, no skips:
  `/tmp/issue657-canonical-120.log`.
- Narrow adjacent cohort: **149 pass / 4 fail / exit 1**, no skips:
  `/tmp/issue657-canonical-adjacent.log`. Seven files: diagnostic-display,
  regex provider/bounded-provider, compression safety, archive lifecycle,
  SafeJS lifecycle and shell cleanup-retention. Session 62646 exited; no live tests.
- Additional dual-cause compression witness reproduced RED before the source fix:
  `/tmp/issue657-cleanup-red.log` (**0 pass / 1 fail**).
- Final canonical targeted plus the same adjacent cohort: **275 pass / 0 fail**,
  no skips/cancellations, exit 0, approximately 1.6 seconds:
  `/tmp/issue657-canonical-final-focused.log`. This is 121 opaque-error tests plus
  154 adjacent tests, including the new explicit guest-error escaping control.
  Final session 10896 exited; no active process handles.
- Tests use memory FS/sinks, injected SafeJS stubs and memory regex event workers;
  no LLM, native FS adapter, network, real worker, fixture-file write, full suite,
  Git, build or lint. Compiler transforms in the loader are memory-only test loading,
  not a package build/typecheck. Root type/build/lint gates remain outstanding.
- Coverage adds host identity across command/middleware/family/wrapper boundaries,
  per-exec override/nested dispatch, callback throw/rejection/nonsettlement,
  callback cancellation, public FsError causes, native errno, codec falsey sources,
  native codec controls, regex/expr host faults and existing guest diagnostics.
- Two old assertions were unreachable behind their initial disclosure RED: borrowed
  sinks also populate ShellResult, and absolute tar operands print a safe leading-slash
  notice. Those expected values now preserve observed current behavior.
- No broad validation is claimed. All original targeted assertions remain.

## Resolved blockers and freeze

- The authored compression cleanup message is wrapped in PublicDiagnostic with
  the original AggregateError as private cause. Both original failure objects
  reach the host hook unchanged. Existing cleanup/status assertions pass unchanged.
- The two injected SafeJS host-failure tests now assert exact opaque text and
  original host-hook identity, retaining raw guest stderr and pending-output drain.
  An additional actual `{ ok: false, error }` guest-result control asserts exact
  escaping, unchanged guest status and zero host-hook events. Existing helper's
  CommandContext overrides support the callback; no helper changes were needed.
- No remaining focused-test blockers. Tools frozen for root coordination; no
  active processes and no Git/build/lint/full-suite commands run here.

## Canonical focused command

```sh
env -u NO_COLOR TSX_DISABLE_CACHE=1 node packages/safe-bash/scripts/test-reporting.mjs \
  --import /home/kjopek/project/poe-code/node_modules/tsx/dist/loader.mjs \
  --experimental-test-isolation=none --test-concurrency=1 \
  packages/safe-bash/tests/shell/opaque-errors.test.ts
```

Canonical application is complete within the grant; commit, push, release and
issue closure have not occurred here. Root owns remaining gates and delivery.

## Exact granted write inventory

The following 49 original targets plus these three subsequently granted paths:

- modify `packages/safe-bash/src/commands/bytes/compression/files.ts`
- modify `packages/safe-bash/tests/commands/diagnostic-display.test.ts`
- modify `packages/safe-bash/tests/commands/safejs/lifecycle.test.ts`

- modify `packages/safe-bash/scripts/integration-inputs.test.mjs`
- modify `packages/safe-bash/src/commands/archive/index.ts`
- modify `packages/safe-bash/src/commands/archive/internal.ts`
- modify `packages/safe-bash/src/commands/archive/stream.ts`
- add `packages/safe-bash/src/commands/bytes/compression/errors.ts`
- modify `packages/safe-bash/src/commands/bytes/compression/gunzip.ts`
- modify `packages/safe-bash/src/commands/bytes/compression/index.ts`
- modify `packages/safe-bash/src/commands/bytes/compression/stream.ts`
- modify `packages/safe-bash/src/commands/bytes/encoding/base.ts`
- modify `packages/safe-bash/src/commands/bytes/encoding/shared.ts`
- modify `packages/safe-bash/src/commands/bytes/encoding/xxd.ts`
- modify `packages/safe-bash/src/commands/column/internal.ts`
- modify `packages/safe-bash/src/commands/diff-patch/patch-gnu-paths.ts`
- modify `packages/safe-bash/src/commands/diff-patch/patch.ts`
- modify `packages/safe-bash/src/commands/diff-patch/shared.ts`
- modify `packages/safe-bash/src/commands/du/budget.ts`
- modify `packages/safe-bash/src/commands/expr/command.ts`
- modify `packages/safe-bash/src/commands/find.ts`
- modify `packages/safe-bash/src/commands/html-to-markdown/index.ts`
- modify `packages/safe-bash/src/commands/index.ts`
- modify `packages/safe-bash/src/commands/internal.ts`
- modify `packages/safe-bash/src/commands/move.ts`
- modify `packages/safe-bash/src/commands/regex-execution/bounded-provider.ts`
- modify `packages/safe-bash/src/commands/regex-execution/matching.ts`
- modify `packages/safe-bash/src/commands/regex-execution/portable.ts`
- modify `packages/safe-bash/src/commands/regex-execution/protocol.ts`
- modify `packages/safe-bash/src/commands/regex-execution/worker.ts`
- modify `packages/safe-bash/src/commands/safejs/index.ts`
- modify `packages/safe-bash/src/commands/search/options.ts`
- modify `packages/safe-bash/src/commands/search/shared.ts`
- modify `packages/safe-bash/src/commands/split/names.ts`
- modify `packages/safe-bash/src/commands/split/options.ts`
- modify `packages/safe-bash/src/commands/split/split.ts`
- modify `packages/safe-bash/src/commands/standard.ts`
- modify `packages/safe-bash/src/commands/stream-format/rev.ts`
- modify `packages/safe-bash/src/commands/table-text/internal.ts`
- modify `packages/safe-bash/src/commands/tail-follow.ts`
- modify `packages/safe-bash/src/commands/text-programs/shared.ts`
- modify `packages/safe-bash/src/commands/text.ts`
- modify `packages/safe-bash/src/commands/tree/io.ts`
- modify `packages/safe-bash/src/contracts/command.md`
- modify `packages/safe-bash/src/contracts/command.ts`
- add `packages/safe-bash/src/diagnostics.ts`
- modify `packages/safe-bash/src/shell/arithmetic.ts`
- modify `packages/safe-bash/src/shell/input.ts`
- modify `packages/safe-bash/src/shell/runtime.ts`
- modify `packages/safe-bash/src/shell/shell.ts`
- modify `packages/safe-bash/src/shell/types.ts`
- add `packages/safe-bash/tests/shell/opaque-errors.test.ts`

The already-written repository plan is
`docs/plans/bugfix-657-opaque-errors.md`; it is not duplicated inside the source patch.
