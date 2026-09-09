# Release integration: September 9, 2026

## Requested outcome

The user explicitly authorizes pushing and releasing the completed changes and
prioritizes issue 687 (zip/unzip) next. The macOS issue remains skipped. Release
the existing fixes before starting ZIP implementation; source-only ZIP preparation
may proceed while release integration runs.

## Merge inputs and ownership

The clean local main at `1dd189f31` contains 20 commits beyond the common base.
Fetched remote main `dd4087fc2` contains 16 different commits. Merge both histories
without force-pushing, discarding either parent's changes, or creating a branch.
Root owns Git, package/bundle integration and publication. Independent workers
resolve exact command inventories and review the owned child-input helper.

The combined command inventory is 89: the historical 82 plus five local utilities
and the remote xq/xmllint pair. Independently declared arrays, frozen fixture
partitions and custom-command totals must retain all members rather than derive
their expectations from the implementation under test. Preserve remote grep,
XML/TOML and workerd support alongside local truncate and native retained seeking.

## Validated integration findings

- The initial merge reports 24 conflicted paths; conflicts are resolved by
  preserving both applicable behaviors and tests, not wholesale parent selection.
- The owned-input helper keeps remote fd3 support and both parents' reset tests.
  EPIPE/ECONNRESET is benign only for owned input streams; output errors stay fatal.
  Its focused unsandboxed suite passes 40 cases with no skips or failures.
- Three focused bundle/package test files pass 16 tests, retaining native-loader
  externalization and combined Node/workerd publication coverage.
- The first full build detects a silently auto-merged duplicate `imports` key in
  the SafeJS manifest. Parsing hid the native mapping behind the remote platform
  mapping. Deep-merge the two parents' import maps into one object, preserving
  every mapping and guard. A JSON AST check rejects duplicate keys in all affected
  package scopes; no guard is weakened to accommodate the error.
- The corrected normal build passes all declared workspace/root stages. Independent
  review finds no validated regression in the native/workerd bundle union: private
  native imports remain blocked in workerd/browser, standalone packaging preserves
  both routes, and combined publication retains reachable canonical chunks.

## Release gates

Run the normal build, complete maintained unit route, repository lint and Bash
consumer typecheck against the merged candidate. Keep original failures beside
corrections. Verify the committed source and clean worktree at gate boundaries.
Fetch again before a normal non-force push; if remote advances, integrate it
instead of overwriting it. Verify remote main contains the delivered commits and
monitor the actual release through successful publication. A local merge or
successful push alone is not a successful release.

Evidence for this integration is under `out/release-20260909-merged/`; process
helper evidence is `/tmp/retained-child-input-merge.5rWQG6/`. Earlier local-only
gate receipts qualify their own revisions, not this merged candidate.

## Final integration checks

The complete maintained `npm test` route passes at merge commit `a15cffe1b`,
including its native pre/post stages. Root lint, the corrected normal build,
focused bundle tests and merged command inventories also pass. The first Bash
typecheck retains one failure in the remote TOML parser fixture: strict generic
inference cannot represent its heterogeneous expected-object union, including
prototype-named keys. Explicitly selecting `unknown` for the assertion generic
preserves every input, expected value and runtime assertion; TypeScript 5.9.3
emits byte-identical JavaScript before and after this annotation. The focused
parser test passes all 37 cases, maintained Bash typecheck passes all 26 current
consumer groups and source/tests, and root lint passes with no errors or warnings.
Receipts are `toml-type-fix-runtime-v1`, `toml-type-fix-emission-v1.json`,
`typecheck-v2` and `lint-v2` under the integration evidence directory.
