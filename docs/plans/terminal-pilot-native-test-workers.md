# Terminal-pilot native test workers

## Problem and evidence

The maintained full unit run failed seven native terminal-pilot session tests across three files. The original thread-pool run reported 281 passing tests and seven 5-second timeouts in 31.02 seconds (`/tmp/poe-689-full-unit-committed.log`). Its worker also failed to terminate: a child node-pty spawn-helper remained blocked before executing the fixture. Native sampling showed `open` at helper startup (`/tmp/poe-689-terminal-helper.sample.txt`); installed `node-pty/src/unix/spawn-helper.cc` opens the slave terminal before executing the requested command.

The installed node-pty README explicitly states that the library is not thread safe across Node worker threads (line 120). The shared Vitest configuration selects two thread workers. This is a documented unsupported native-library topology, rather than evidence that the fixture needs a longer deadline.

An independent lifecycle test defect also leaked an actual terminal: its mocked successful close removed the session from tracking without closing the native process. Adding an assertion for a non-null actual exit code failed against that implementation (`/tmp/poe-689-terminal-close-red.log`).

## Changes

- Select Vitest's `forks` pool only in terminal-pilot's maintained `test` and `test:unit` commands. Keep the shared configuration, two workers, exact file membership, timeouts, and native pretest build hooks.
- Make the close-retry test's second attempt call the real session close, assert actual native exit, and restore the spy and close the session in `finally`.
- Keep native spawn, input, keypress, screen/history, screenshot, and repeated CLI session coverage. No product runtime or native dependency changes are required.

## Validation

- RED: the close-retry test observed `exitCode === null` after its fake successful close.
- GREEN: all 288 tests in eight terminal-pilot source files passed with process workers in 2.16 seconds (`/tmp/poe-689-terminal-forks-green.log`).
- GREEN: `npm run test:unit --workspace=terminal-pilot` completed its declared pretest build and all 288 tests in eight files (`/tmp/poe-689-terminal-maintained-green.log`).

The observations establish that the corrected supported topology passes the original failing tests. They do not identify a particular node-pty internal shared variable responsible for the blocked native open, or attribute all seven failures to the separately fixed leaked-session test.
