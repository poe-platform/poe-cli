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
