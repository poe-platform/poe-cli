# Issue 697: bounded TOML input for yq

Current direct execution rejects `yq -p toml` and `--input-format=toml` with
`CLI_UNSUPPORTED_OPTION`; its SDK rejects `inputFormat`. The existing yq module
is internal and excluded from build/public exports. Expose it as an explicit
public plugin while adding TOML input to its existing bounded query/output path.
The default agent catalog remains 84 commands; users register `yqCommands()`.

## Command and SDK behavior

Support `-p FORMAT`, `--input-format FORMAT`, and `--input-format=FORMAT`, with
`yaml` and `toml` values. YAML remains the default. A validated, captured SDK
`inputFormat` option is available on the command factory, family factory, and
plugin; an explicit CLI selection overrides it. Retain existing query syntax,
JSON/YAML output, status classes, input ordering, VFS-only acquisition, and
cleanup/cancellation behavior. Unsupported formats and options fail explicitly.

A TOML source contains exactly one document, including an empty document mapping
to `{}`. It bypasses YAML document-marker framing: `---` inside a multiline TOML
string is content. Do not add format autodetection, TOML output, or another
executable. The existing fixed yq resource limits remain authoritative.

## Parser profile

Implement a dedicated charged TOML scanner using the existing owned work and
ledger contracts. Support TOML 1.0 key/value configuration syntax: quoted/bare
and dotted keys, tables and arrays of tables, ordinary arrays and inline tables,
basic/literal single and multiline strings, comments, booleans, numeric forms,
and validated date/time values. Reject duplicates, incompatible redefinitions,
invalid escapes, malformed numeric tokens, and table ownership violations.

Preserve yq's conservative numeric schema: reject unsafe integers and nonfinite
values explicitly rather than silently rounding. Project validated date/time
source text to strings without timezone conversion or fractional truncation.
Document this profile; do not claim type-preserving TOML round trips or universal
TOML conformance. Python tomllib and the primary TOML 1.0 specification are
independent syntax oracles, not production parsers or exact date-output oracles.

Charge scanning, path traversal, implicit table creation, retained nodes, and
value bytes before publication. Bound nesting during parsing, including dotted
keys and implicit table depth. Preserve independent document/node/scalar/value
limits and cooperative yielding within long tokens. Inline-table sealing and
array-of-table ownership require explicit metadata; ordinary arrays cannot be
reinterpreted as table arrays.

## Public integration and validation

Admit the existing yq and shared query-core files to the maintained build and
package source inventory. Export the plugin/factories/options through public root
and `commands/yq` entries. Add the portable yq leaf to the same split browser graph
as the root and XML leaf, preserving owned-value and filesystem identities.
Keep root and derived scoped metadata aligned. Do not edit README files.

Use TDD for parser, driver, and public wiring. Independent cases cover grammar,
implicit depth/node accounting, repeated paths, unsafe values, exact date strings,
YAML-marker strings, invalid UTF-8 argument identity, VFS ordering, live false/
object cancellation, sink failures, and unchanged YAML behavior. Preserve frozen
historical captures; update only current help/refusal expectations for new syntax.
Unit tests use memory; native oracle captures live outside the repository.

Run focused checks and installed Node/Bun/browser/workerd consumers, then the
maintained full build/test route. Commit a reviewed candidate before any gate
that requires exact committed package metadata. Inspect ad hoc command screenshots.
Finish with a normal build and serial lint against a stable checkout. Push only
after gates pass, verify remote main and every release, install exact published
packages, then close #697 before selecting another issue.

## Validation record

The driver baseline rejected TOML flags and SDK configuration. The public export
test failed on the missing yq entry before wiring; the resulting public bundle
and metadata checks pass 41 cases. Driver and existing YAML checks pass 101 cases,
and independent review passes 39 cases. Review identified an implicit table that
must become dotted-defined when traversed by a dotted assignment; the regression
now rejects its subsequent header declaration while preserving both legal paths.

The first normal build, 100 integration-discovery checks, and all 17 package-lint
rules pass. An ad hoc screenshot verifies help, scalar/filtered output, exact
date precision, and invalid-format diagnostics. Final committed build, full unit
route, serial lint, installed consumers, and release checks remain delivery gates.
