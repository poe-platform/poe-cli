# Issue 673: SHA-2 checksum commands

## Scope

Add `sha512sum`, `sha384sum`, and `sha224sum` to the existing checksum factory,
including GNU-style default, binary/text, check, tagged, NUL-delimited, and
escaped-filename workflows. Share tagged rendering and manifest verification
with the existing SHA-256, SHA-1, and MD5 commands.

The current implementation already contains the bounded, streaming Noble
implementations and the 128/96/56 hexadecimal verification widths. Do not add
another hash implementation, dependency, host-file access, or native fallback.

## Implementation

- Register the three names in `src/commands/bytes/checksums/index.ts`.
- Parse `--tag` in the shared sum-command options. Tag selection implies binary
  mode; later `--text` is rejected unless a later mode selects binary again.
- Reject `--tag --check` before acquiring input. Plain `--check` accepts both
  traditional and tagged records, including mixed manifests.
- Match tagged algorithm labels case-sensitively and enforce the selected
  algorithm's exact digest width. Reuse filename validation and escape decoding.
- Render tagged filenames using the existing escaped-prefix rules; `--zero`
  emits raw filenames and a NUL delimiter instead.
- Preserve cumulative input admission, 64-KiB manifest lines, 16-KiB filenames,
  cooperative block yielding, abort identity, iterator cleanup, backpressure,
  VFS-only reads, and digest destruction.

Aggregate byte and agent factories inherit these definitions automatically.
The root integration owner updates independently specified inventories from
79 to 82 and validates the rebuilt and installed public entries. Those files,
manifests, README files, and build outputs are outside this implementation patch.

## Tests and independent oracle

Validation on September 8, 2026 uses Node 22 from
`/tmp/kamilio-ci-image-toolchain.path` and the maintained Safe Bash reporter.

- First RED: the expanded checksum suite reports 44 tests, 20 passing and
  24 failing on missing registrations and tagged generation/verification.
- GREEN: the normal isolated five-file checksum/input-budget cohort passes.
  Separate per-file diagnostics report 137 passing tests with no skips:
  algorithms 30, checksums 44, portable 1, streaming 28, input budgets 34.
- Existing vector and escaped-filename cases now include all three commands.
  Tagged controls cover mixed manifests, algorithm mismatches, malformed
  widths/escapes/names, option ordering, and rejection before VFS acquisition.
- Existing browser execution also exercises each named checksum and `--tag`
  without `process`, `Buffer`, or `crypto` globals. New names participate in
  giant-chunk yielding, blocked-source cancellation, VFS-only execution, exact
  cumulative caps, and paused-manifest cleanup controls.
- Independent `/usr/bin/*sum` GNU coreutils 8.30 observations establish option
  combinations, tag parsing, escaping, and NUL records. A 54-case differential
  observation matches exit status, stdout, and stderr across all six digest
  commands for generation and supported verification cases. Its native files
  are disposable oracle inputs; maintained unit fixtures remain in memory.

Local evidence: `/tmp/kamilio-673-checksums-red.log`,
`/tmp/kamilio-673-focused-green.log`, per-file
`/tmp/kamilio-673-*-counts.log`, `/tmp/kamilio-673-gnu-tag-oracle.json`, and
`/tmp/kamilio-673-gnu-differential.json`.

## Compatibility boundaries and handoff

- Preserve the package's existing usage-error exit code 2; GNU reports 1 for
  invalid tag/check/text combinations. Verification failures continue to use 1.
- Preserve existing carriage-return and verification-status filename escaping;
  GNU 8.30 differs from the retained newer-GNU-oriented behavior in these cases.
  Do not claim universal GNU diagnostic-byte parity or rewrite historical data.
- `--zero` remains generation-only; `--check --zero` is rejected. `cksum`
  algorithm selection remains supported, but its options are not expanded to
  include verification in this issue.
- No build, full-root lint, Git operations, staging, or publication occurs in
  this worker scope. Root owns inventory integration and final maintained
  build, typecheck, lint, installed-consumer checks, and release delivery.
