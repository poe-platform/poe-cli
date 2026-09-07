# Float32 operations during buffer resizing

Follow-up to the ArrayBuffer foundation. Do not claim full resizable typed-array
compatibility from the initial bounds and tracking tests.

Read-only native/interpreter comparisons on the current implementation confirmed:

- `view.join(separator)` where `separator.toString()` shrinks an eight-byte
  tracking view's buffer to zero returns `"-"` natively, but
  `"undefined-undefined"` in SafeJS. Missing indexed elements contribute empty
  strings after separator coercion; the originally captured element count stays.
- `view.slice(start)` on a fixed view at offset four, where `start.valueOf()`
  shrinks its buffer to zero, throws native TypeError but SafeJS RangeError.
  Revalidate the view after coercion with native exception ordering.
- A control using a length-tracking iterator at offset zero followed by shrinking
  its buffer to zero agrees: `{value: undefined, done: true}`. Do not change this
  passing behavior. A fixed view becoming out of bounds still needs comparison.

Next: add native-oracle failing tests for these cases before implementation.
Include fixed versus tracking views, zero/nonzero slice counts, resize during end
coercion, iterator recovery, snapshots and budget retention. Keep this follow-up
atomic and qualify it independently; do not change currently running full-suite
sources during qualification.

Join follow-up is now in progress after foundation commit
`64625bc4b6ea825fe81690d03fb4674c8181faf0` was verified on remote main.
Five native tests produced three failures (full/partial shrink) and two passing
controls (growth and shrink/regrow). The join loop now emits empty text for
missing indexed values while retaining its original captured length and budget
checks. Logs: `/tmp/poe-safejs-join-resize-red.log` and
`/tmp/poe-safejs-join-resize-qualified.log`. This follow-up is still local and needs
lint, type, broader focused checks and its real harness before its own push.

Foundation release monitoring: scoped workflow 34092258055 and CLI workflow
34092258379 were both in progress after verified push. Neither publication is
confirmed yet. Continue this work while monitoring those runs.
