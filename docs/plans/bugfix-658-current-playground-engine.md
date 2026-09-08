# Issue 658: build the playground from current workspace code

## Validated defect

The playground installs the safe-bash-engine alias at poe-code 14.0.4 and rejects
other versions in its build plugin. Its browser and declaration imports therefore
ignore current workspace fixes. This is a source/build binding defect; updating
only the displayed version or repeatedly bumping a registry pin is insufficient.

## Implementation and checks

- Add failing actual-browser-kernel assertions for workspace artifact paths and
  the already delivered predicate nesting limit.
- Declare SafeBash and SafeFS workspace build dependencies and consume their
  canonical current artifacts, preserving the existing browser worker adapters.
- Update type imports, filesystem aliases and Vite matching/watching for workspace
  paths. Preserve command inventory, explicit capability exclusions and UI limits.
- Replace existing stale-pin documentation without adding README sections.
- Run maintained playground tests/build, inspect real browser screenshots and
  verify the deployed Pages workflow separately after delivery.

Root owns this patch, its lockfile update, Git delivery and release monitoring.
Other workers own issues 663 and 665 in disjoint SafeBash source files.

## Evidence — September 8, 2026

- Before implementation, both new assertions failed against the old alias:
  artifact paths did not bind the workspace and 257 predicate parentheses
  incorrectly succeeded. The unchanged kernel controls were skipped for RED.
- After implementation, all 33 browser-kernel tests and all 166 playground tests
  passed. The normal maintained root build passed, including the playground
  production build and its workspace dependency closure.
- Actual Vite development startup exposed an ES2020 dependency-optimization
  failure in the current browser polyfills. Aligning the development optimizer
  with the existing ES2022 production target restored startup. Both development
  and production previews execute jq, sed, pipelines and conditional patterns.
- The production browser now rejects the same 257-parenthesis predicate with
  status 2 and `test: expression nesting exceeds 256`. Screenshots of the loaded
  workspace and successful commands were captured and visually inspected;
  accessibility output independently records the exact refusal and status.
- Lockfile inspection confirms only removal of the obsolete engine alias and
  its bundled descendants, plus the two declared workspace dependency edges.
  Unrelated optional dependency records remain unchanged.
- Evidence lives under `/tmp/kamilio-658-gate.Q2Z496` and the
  `/tmp/kamilio-658-{dev,production}-*` browser captures. Push, Pages deployment
  and broader integration results are separate delivery gates.
