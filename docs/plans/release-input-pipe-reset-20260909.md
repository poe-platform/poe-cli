# Release input-pipe reset investigation

## Observed failure

Release run `34373843502`, remote commit
`9a6dd9264060801ed5b30ae4446342c432995cab`, fails Bash shard 4 in job
`102542729822`. Its completed log reports 5,175 passes, one failure, and 23
skips. The failed test is `isolated child safely closes an unread extra input
pipe`, at `tests/shell-stress/process.test.ts:198`. The expected harness error
is absent; the actual error is `read ECONNRESET` from `Pipe.onStreamRead`.

Evidence is preserved under `out/issue-678-tmp/`:

- `release-34373843502-job-102542729822.log` contains the exact job output.
- `release-9a6dd926-process.ts` has SHA-256
  `4079d23b257def66164e3f37a8e31e24dafdbab626a967b02e02984c1f7f9c37`.
- `release-9a6dd926-process.test.ts` has SHA-256
  `22ebcd5bcbf01ad75e496cdb2a34e7a9d4da0db196583784aa2dc2b4562055af`.

These copies come from the exact remote commit, not mutable `main`. They are
evidence, not replacements for local files. Current local code lacks the remote
extra-input feature and its new test. Both versions nevertheless have the same
EPIPE-only error handling for writable child input streams. A local defect must
be independently reproduced before any local repair is justified.

## Bounded repair criteria

1. Read the complete current helper/tests and the exact remote versions.
2. Reproduce the shared defect against current code with a failing control;
   otherwise report that it cannot be validated locally and do not patch it.
3. If validated, repair only the owned process helper and its existing test
   file. Do not import unrelated remote features, weaken the failing assertion,
   skip a case, normalize failures, retry to pass, or raise timeouts.
4. Distinguish expected input-pipe closure from output-stream failures and other
   input errors. Preserve actual child status, deadline enforcement, output
   bounds, process-group cleanup, and resource ownership.
5. Preserve red/green evidence and run focused regressions, negative controls,
   independent review, and the maintained checks warranted by the shared helper.
6. Keep any validated fix in its own local commit with this plan. Remote writes
   remain restricted; a local commit does not repair the running remote release.

This is a test-process harness investigation, not a GNU utility behavior change.
It does not resolve truncate's remaining Memory/version differences. Release
monitoring remains separate from local validation and delivery.

## Validated local candidate

- The two actual ordinary-stdin child cases, exiting 0 and 7 with a 1 MiB
  unread input, pass before the repair. They do not reproduce the native fd3
  reset observed remotely and are not represented as doing so.
- Deterministic controls inject the observed `ECONNRESET` into the actual
  child's stdin stream. Against the unchanged helper, the final red run reports
  24 passes and five failures: three failing injected-reset controls and their
  two failing parent tests. Earlier sandbox pipe failures remain separate.
- The candidate changes only the stdin error predicate: `EPIPE` and
  `ECONNRESET` are accepted there; stdout/stderr errors and other stdin errors
  still take the existing fatal cleanup path. It does not add remote fd3 or
  extra-input support, modify deadlines/output bounds, or alter child statuses.
- The same tests pass after the one-line change: 29 reported tests, zero skips
  or cancellations. Negative controls retain exact fatal error identity,
  SIGKILL/null status, and process-group cleanup. Benign controls retain child
  exit 7 and exact output bytes. Deadline and overflow checks still fail with
  their original errors after an input reset.
- Two focused caller files also pass, reporting 22 tests without skips or
  cancellations. These are `targeted-holdout/lifecycle.test.ts` and
  `input-boundary-holdout/compatibility.test.ts` under `tests/shell-stress`.
- The complete worker report, commands, red/green logs, source differences and
  hashes are in `out/release-input-pipe-20260909/report.txt`. Independent review
  and maintained integration checks remain required before committing the fix.

The root release later completes with failure at September 9, 2026 16:17:23 UTC.
All other validation jobs succeed and `release-stable` is skipped. This local
candidate has not been delivered remotely or validated by a new release run.

## Independent causal review

- A separate reviewer finds no actionable issue in the scoped patch and
  reproduces the actual native fd3 reset against the exact remote helper.
  One original invocation observes `read ECONNRESET` and returns that error
  despite child exit 0. One evidence-only variant with the identical predicate
  change observes the same native reset and returns exit 0 without error.
  Neither comparison injects the native reset or retries to obtain a pass.
- Two additional injected fd3 comparisons preserve exit 7 and exact output
  only with the changed predicate. All four comparisons check destroyed
  streams and absent process groups; a final unmocked stdin echo checks spawn
  restoration. These run on actual Node 22.22.0, not the release's 22.23.2.
- The remote originals remain immutable, and none of their additional features
  entered local source. The local ordinary-stdin native case still has no
  observed reset; the native causal evidence is specifically the remote fd3
  case. This does not qualify the whole remote job or reset frequency.
- Mock restoration and serial/file-isolated test execution were reviewed.
  Deliberately concurrent same-process execution and extreme scheduler
  starvation are outside the demonstrated coverage; no broad flake immunity
  is claimed.
- Evidence: `out/release-input-pipe-review-20260909/report.txt`, its four raw
  comparisons, final native control, predicate-only diff, and immutability
  hashes. Maintained guarded ESLint also passes: 10,475 configured inputs
  linted, zero errors or warnings, in
  `out/release-input-pipe-20260909/root-eslint-v1.log`.

## Broader gate finding

The maintained workspace typecheck completes with exit 2, not a pass. Its two
unexpected diagnostics are TS2532 at lines 254–255 of
`tests/plugins/qualified-native-required-peer.test.ts`, introduced by this
thread's earlier filesystem-foundation commit `541042a1a`. Neither diagnostic
is in the input-pipe candidate. The source/test compiler visits the candidate;
the current consumer groups succeed and the three intentional negative groups
retain their expected diagnostics. None of that converts the failed overall
gate into success.

The native-peer assertions are being corrected as a separate atomic change,
without optional chaining or suppression that could hide an absent edge map.
The full maintained typecheck and wider Bash validation remain to be completed
after that correction. The input-pipe fix's independent review, focused
red/green checks, and guarded ESLint are complete; remote delivery is not.
