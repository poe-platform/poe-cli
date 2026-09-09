# Issue 678: GNU-compatible file resizing

## Root implementation decision: September 9, 2026

- Add `preferredIoBlockSize`, `OpenResizeFileOptions`, `FileResizeHandle`,
  `openResizeFile` and affirmative `retainedResize` as the narrow contracts
  described in the preparation below. This is a root implementation decision,
  not a claim of a separate user approval or completed backend support.
- Memory's explicit virtual preferred-transfer policy is 4,096 bytes, matching
  its existing Node-stat bridge profile. Do not infer 64 KiB from a stream chunk
  default, or claim any virtual policy is a native physical observation. Real
  uses valid native metadata; unavailable observations stay unavailable.
- Retain write authority from acquisition. In particular, native descriptor
  resizing does not recheck a later chmod as if opening the pathname again.
  Preserve open-before-calculation effects and namespace replacement behavior.
- Root owns types, admission helpers/tests, authoritative contract docs and the
  safe-bash type re-export. Separate workers will own Memory, Real, and composed
  wrappers/quota. No backend may advertise support before its complete guarded
  resource route exists. No command registration or closure is implied.
- Initial TDD receipt `/tmp/kamilio-678-resize-admission-red.log` reports 19
  failing controls: the readonly view lacks explicit denial and the retained
  resize admission APIs do not exist. These are missing-feature failures,
  not native-parity passes or evidence of implemented resizing.
- Admission helpers now pass all 19 controls, including interruption of opaque
  metadata, draining a late acquired resource, selected-path readonly denial
  and exact falsey failures. The neighboring capability suite passes 31 checks
  combined; scoped strict TypeScript also exits 0. Receipts use
  `/tmp/kamilio-678-resize-admission-{green,neighbours,types}`. Backend support,
  quota composition and the utility itself are not established by these gates.
- Two additional bounded GNU controls establish a null-device target gap:
  open succeeds, then ftruncate fails with EINVAL and the attempted byte size
  in the diagnostic. `/tmp/issue-678-composition-device-native-confirmed.json`
  retains the clean controls; the sandbox instrumentation failure is separate.
  Root expands the retained protocol to explicitly supported nonregular targets
  and selects the virtual null device's 4,096-byte preferred-I/O hint. The
  composition owner will replace early device denial with a pinned null handle
  and native-equivalent truncate failure through TDD. This closes a validated
  target-phase gap; it does not solve or waive nonregular reference seek behavior.

## Confirmed scope and original-source reading

- Issue 678 remains open and is authored by kamilio. Required behavior includes
  exact sizes, relative/minimum/maximum/multiple modifiers, reference files,
  I/O-block units, bounded growth charged to VFS quotas, cancellation and
  VFS-only paths. Preserve the preceding utilities' atomic delivery order.
- On September 9, 2026, root read all 399 lines of GNU coreutils 8.30
  `src/truncate.c`, plus `lib/stat-size.h`, from the already authenticated archive
  `/tmp/fmt-675-coreutils-8.30.tar.xz`. Utility source SHA-256:
  `2c56bcf96be1e78deea35b74292c31ad18411dc44edda09a7844297d1770f099`.
- Current public `Shell` execution of `truncate -s0 /probe` returns status 127,
  empty stdout and `shell: line 1: truncate: command not found\n`. No product
  implementation or registration has been added at this checkpoint.

## Source-derived requirements

- Preserve option validation and diagnostic order, including repeated size
  settings, whitespace, source-supported binary/decimal suffixes, signed off_t
  bounds, zero-divisor rejection and reference/size combinations. Inspect the
  original integer-parsing and quoting helpers before implementing these paths.
- Native opens each target for writing before computing and applying its new
  size. Missing targets may be created even when a later per-file calculation
  fails. `--no-create` suppresses only the relevant ENOENT open failure; other
  failures remain observable and later targets still run.
- Reference size is resolved once before target processing. Relative sizes use
  that reference where specified; absolute reference-only behavior differs from
  per-target current-size calculation. Preserve zero clamping and extension/
  rounding overflow checks.
- `--io-blocks` uses the target's preferred I/O block size, not the allocation
  block size or the reference's block size. The current FileStat contract exposes
  neither preferred I/O block size nor a writable retained handle. Investigate
  truthful metadata/handle support before choosing an implementation; do not
  silently hardcode one host profile or claim descriptor race parity from
  separately resolved path operations.
- Existing optional `FileSystem.truncate` and the quota wrapper are relevant;
  the wrapper checks the logical target size before invoking truncate. Preserve
  quota enforcement even for sparse growth. Refuse unsupported operations rather
  than bypassing wrappers, materializing unbounded zeros, truncating through an
  implicit host path, or replacing an existing inode with an unrelated file.

## Verification and delivery

- TDD with static native byte/status/filesystem-effect captures and in-memory
  maintained tests. External native experiments use isolated owned fixtures.
- Independently compare every modifier, prefix/suffix/overflow edge, target
  error continuation, reference behavior, hardlink/symlink effects and quota
  admission. Cover actual Shell/VFS workflows, cooperative cleanup, falsey
  failures, no late mutation and opaque metadata cancellation boundaries.
- Root owns later registration, independent literal inventories, public
  consumers, screenshot validation and atomic delivery. No README additions,
  unrelated edits, broad staging, push, issue closure or release are authorized
  by this preparation document. Existing external-write approval remains pending.

## Read-only sidecar findings: September 9, 2026

### Read and evidence scope

- The preparation worker read all **399 lines** of the original GNU 8.30
  `truncate.c`; its SHA-256 matches the root's value above. Also read
  `stat-size.h`, `xdectoint.c/.h`, the `usable_st_size` definition in `system.h`,
  and the relevant ftruncate portability implementation. The original xstrtol
  parsing and gnulib quoting paths were already read from this same authenticated
  archive for numfmt. No GNU implementation code was copied into product files.
- References and experiments are under `/tmp/truncate-678-sidecar-reference`.
  **Only this plan changed in the repository.** No product/test/snapshot file,
  numfmt edit, registration/inventory edit, build/lint/test gate, Git operation,
  remote mutation, or delegation was performed for this preparation.
- `native-controls-direct.json` contains **37 bounded native controls** with raw
  stdout/stderr hex, exit status and file effects. Tool: `/usr/bin/truncate`,
  GNU coreutils 8.30, `argv[0]=truncate`, `LC_ALL=C`, ignored stdin, 3,000 ms
  per-process timeout, uid 150124. Executable SHA-256:
  `72577f960652d3abb3f3a61b807b061fe433f0deaa8edec1f9230087806e299c`.
  These are preparation observations, not a maintained suite or implementation
  parity result. The first shell-mediated capture was contaminated by shell
  startup diagnostics/locale changes; `native-controls.json` and
  `native-controls-initial.txt` remain preserved, not normalized or counted as
  clean controls. Direct execution avoids that shell and does not read stdin.

### Source details that affect implementation

- **Repeated `-s` is stateful, not simply last-size-wins.** `rel_mode` is not
  reset on a later plain size. With a six-byte target, `-s+1 -s2` produces eight
  bytes; `-s'<1' -s2` produces two. `-s+1 -s+2` reports multiple relative
  modifiers. `-s/2 -s0` still reports division by zero. Preserve this explicit
  source behavior instead of using a generic stateless option-value reducer.
- Strip source-defined whitespace before the modifier and again before parsing
  its value, but not trailing whitespace. `xdectoimax` accepts signed off_t
  bounds and suffix set `EgGkKmMPtTYZ0`: e.g. K is 1024, KB is 1000, KiB is
  1024; an implicit K is accepted. The b/c/w and multiplication forms are not
  accepted. Numeric errors use capitalized `Invalid number` and locale quoting;
  path errors use gnulib `quoteaf` shell-escape quoting. Do not reuse numfmt's
  different unit grammar or locale-only quoting for filenames.
- After option parsing, validation order is: size/reference required;
  reference plus explicit size must be relative; `--io-blocks` requires explicit
  size; file operand required; then resolve reference. Native controls verify
  missing operands beat a missing-reference stat error, while an invalid
  reference prevents any target creation.
- Reference is resolved **once**, even when it is also a target or appears as
  repeated target operands. With reference size seven, `-r reference -s+2`
  sets both existing and newly created targets to nine, not current-target-plus-
  two. Reference-only uses the captured size directly and does not require a
  target fstat. Relative operations without a reference do require target fstat.
- Target order is open-write-with-optional-create, then fstat when necessary,
  block multiplication/size calculation, ftruncate, then close. Native uses
  O_WRONLY/O_NONBLOCK, **not O_TRUNC and not O_APPEND**. It checks write access
  even for a same-size result and does not require reading target contents.
  A missing target remains created at size zero when later block-multiplication
  or reference-relative extension overflows; both effects were captured.
- `--no-create` suppresses an **open ENOENT**, including missing parents and a
  dangling symlink's absent referent in this profile; it does not mean lstat-
  exists. Without `-c`, a dangling symlink creates its referent. A missing path
  ending in slash can have different open errors with and without O_CREAT.
  Do not preflight existence with lstat or drop trailing slashes. `-` is a
  literal filename, not stdin. Later targets continue after per-target errors;
  failed close has its own diagnostic and contributes exit status one.
- `/` and `%` are floor/ceil to a positive multiple; `<` and `>` are maximum
  and minimum bounds, respectively. Relative negative results clamp to zero.
  Block multiplication, positive extension and rounding-up overflow have
  distinct per-target diagnostics. Parse/calculate with BigInt, not Number;
  convert only after checking the actual VFS size domain. Do not confuse a
  valid 64-bit GNU size that exceeds an adapter limit with a parse overflow.
- `--io-blocks` uses **the opened target's** preferred I/O block size, including
  when a reference supplies the base length. Zero block count still follows the
  source fstat path. `ST_BLKSIZE` accepts a positive native st_blksize within
  its native size_t bound, otherwise uses that build's DEV_BSIZE; neither
  `allocatedBytes`, st_blocks' 512-byte units, read chunk size, nor a guessed
  universal 4096 is a replacement. The native fixture reported 4096; that is
  a measured profile value, not a portable default.
- `usable_st_size` does not accept directory/character sizes just because a
  stat has a number: other kinds use open/lseek(SEEK_END). In this host's
  directory-reference control that returned OFF_T_MAX, then target creation
  preceded an EFBIG resize failure. Another filesystem may fail the seek.
  Treating every directory reference as size zero or a universal EISDIR would
  be invented behavior. Non-regular reference semantics remain an explicit
  contract gap; do not mark them supported from FileStat.size alone.

### Actual VFS findings

| Current surface | What it establishes / does not establish |
| --- | --- |
| `packages/safe-fs/src/contracts/filesystem.ts:6` | FileStat has numeric size and optional allocatedBytes/identity. No preferred-I/O-block observation exists. Size is number, not a 64-bit integer carrier. |
| `packages/safe-fs/src/contracts/filesystem.ts:70` | FileReadHandle has stat/read/close only. No retained writable or resize handle, and no generic seek-end contract. |
| `packages/safe-fs/src/contracts/filesystem.ts:148` | Optional path-based truncate accepts number and FsOptions. The truncate capability does not promise descriptor identity, sparse storage, atomic lookup-plus-resize or target creation. |
| `packages/safe-fs/src/fs/memory/index.ts:663` | Resolves an existing file, checks write permission, allocates the complete new size, preserves the FileNode/inode, copies the prefix and updates timestamps. Hardlink aliases and existing retained readers see the same changed node. No missing-file creation. |
| `packages/safe-fs/src/fs/real/index.ts:476` | Confined path resolution, O_WRONLY/O_NOFOLLOW/O_NONBLOCK open, regular-file check, native handle.truncate, finally close. Preserves the opened inode for this call and permits native sparse growth, but exposes no handle to join the command's preceding stat/calculation to this open. It validates safe-integer sizes and does not create missing files. |
| `packages/safe-fs/src/fs/overlay/index.ts:836` | Stages a clone and renames it over the path, bounded by maxBufferBytes. Clone explicitly refuses multiple/unknown hardlink identity where required; a single-link resize still replaces the inode. This is not inode-preserving truncate parity. |
| `packages/safe-fs/src/fs/s3/filesystem.ts:810` | Conditional object replacement, bounded by maxReadBytes, with dense new-body allocation; no retained inode/native sparse promise. Missing target is ENOENT. |
| `packages/safe-fs/src/fs/webdav/webdav.ts:1171` | truncate is explicitly unsupported. A callable optional method alone is insufficient capability evidence. |
| `packages/safe-fs/src/fs/quota/index.ts:139` | Queues admission based on the logical target length before calling the wrapped path truncate. Do not unwrap it or replace its policy with a command-local byte counter. |
| `packages/safe-bash/src/contracts/filesystem-output.ts:38` | FileOutput is sink/signal/finish/abort, not retained stat/resize. Its w/a opening behavior cannot model non-truncating writable open with optional no-create; descriptorWriteStream is not a resize-handle capability. |

- `vfs-observations-corrected.json` records ad-hoc **in-memory** observations:
  Memory hardlink shrink changed file, alias and retained reader sizes from six
  to two without replacing inode 2. After pathname replacement, its retained
  reader still described the old node; path truncate affected the replacement.
  The only handle methods were stat/read/close.
- Overlay refused hardlink resize with `ENOTSUP: copy-up cannot preserve hardlink
  identity`. For a single-link upper file, resize changed inode 3/size six into
  inode 6/size two; an already retained reader still reported inode 3/size six.
  The first ad-hoc probe stopped at the hardlink refusal; its empty
  `vfs-observations.json` remains preserved. The corrected capture records that
  refusal rather than assuming aliases were silently corrupted. No adapter
  changes are proposed as already implemented or validated by this observation.

### Quota and logical sparse growth

- Memory already has separate logical and retained-storage limits: defaults
  maxFileBytes=16 MiB, maxRetainedBytes=64 MiB, maxMetadataUnits=10,000
  (`packages/safe-fs/src/contracts/memory-limits.md`). Dense truncate reserves
  its new buffer **before releasing the old one**, so replacement peaks matter
  even for shrink/same-size operations. Do not release accounting early, raise
  configured limits, or emulate unbounded zero allocation in the command.
  The small-limit observation rejected growth past maxFileBytes with EFBIG and
  left contents/size unchanged.
- The existing quota is logical **namespace** accounting, not allocated blocks
  or unique inodes: every visible hardlink entry counts; symlink storage counts.
  Before existing-file growth, known aliases and unknown possible aliases are
  charged the positive delta. A six-byte file plus hardlink under a 20-byte
  quota rejected resizing either link to eleven, leaving both at six.
  Sparse native growth must still charge this logical size; zero st_blocks is
  not free quota. Shrink credit remains conservative and single-entry.
- Census limits (4,096 entries / depth 64 by default) also apply to shrink.
  The queue covers its admitted write-like operations, not arbitrary external
  writers; namespace mutation/independent-wrapper races are not a storage lease.
  The existing quota contract explicitly documents incomplete absent-file
  creation accounting through multiple alias mounts. Truncate creation must not
  silently inherit that gap and claim comprehensive composed-quota protection.
- No sparse-Memory redesign is necessary merely to expose its existing bounded
  resize behavior. However, **logical-only large sparse growth in Memory is not
  available today**: size derives from node.data length. If that is required
  beyond current dense limits, it needs a backing-store representation change
  under the existing logical/retained ledgers, not a command workaround. Real
  can remain natively sparse within its admitted numeric/quota domain. This is
  an explicit implementation decision/gap, not a silently dropped requirement.

### Minimum API work to approve before command implementation

1. **Truthful preferred-I/O-block metadata.** Add a narrowly defined optional
   observation to the authoritative safe-fs FileStat contract (name not selected
   here), source it from validated native Stats.blksize for Real/path and retained
   observations, and preserve it in explicit stat-copy helpers in Mount,
   Overlay and ReadOnly. Memory/S3/WebDAV must not claim a native value they do
   not have. A documented virtual-backend preferred-block policy would require
   an explicit contract decision. Missing observation cannot silently become a
   host-profile constant; it is a remaining `--io-blocks` support gap.
2. **One retained writable-resize acquisition.** The missing operation must open
   existing files without truncating/appending, optionally create missing
   referents, require write rather than read permission, and return stat/resize/
   close bound to that same opened object. These are required semantics, not
   currently available API/capability names. Reusing openReadFile, appendFile
   with empty bytes, writeFile(w), or stat(path)+truncate(path) cannot provide
   them. Same-object resize must survive rename/unlink/replacement without
   touching the new pathname occupant. Reject unsupported backends explicitly;
   do not advertise the full utility until required support is supplied.
3. **Wrapper-safe mutation ownership.** Positive support must be path-specific
   and truthful, with ReadOnly denial, Mount/device routing, metered operation
   admission (`fs/scoped.ts`), and explicit Quota wrapping. The quota proxy's
   generic method fallback must not leak a new raw write handle. Handle resize
   needs the quota queue and logical admission for the pinned object's identity,
   not a later stat of its stale opening pathname. Avoid stale shrink credit
   and account visible/unknown aliases conservatively. Creation must remain
   separately visible if a later resize fails, subject to admitted metadata/
   quota policy. Overlay's copy-up and S3's replacement limitations are blockers
   to assuming this promise from their existing truncate method.
4. **Bounded lifecycle, not metadata deadlocks.** Follow the existing retained-
   reader close contract: register cleanup before acquisition, close admission
   synchronously, drain admitted cooperative acquisition/mutation and one shared
   idempotent close, reject later operations, preserve original falsey failures
   and caller cancellation. Close late-acquired resources after cancellation.
   Do not wait forever on opaque pre-acquisition capability/stat promises. Native
   dispatched syscalls/external writers cannot be magically rolled back; qualify
   the guarantee rather than promising impossible universal late-effect absence.
5. **Numeric and special-reference boundary.** GNU parsing is signed 64-bit;
   current VFS resize arguments are safe-integer numbers. Choose an explicit
   bounded failure for a calculated value outside that domain, at the correct
   post-open phase, or separately approve a larger integer contract. Never round
   the value through Number. Resolve non-regular reference seek behavior with
   an honest contract/profile; neither directory stat.size nor a retained-reader
   method supplies it today.

### Bounded next implementation sequence

- First agree the two missing contract surfaces and wrapper admission above;
  this is not a request to redesign all filesystem APIs. Keep numeric/parser
  logic in the command and resource/storage policy in safe-fs. No backend- or
  provider-name branching, implicit host path fallback, inode-replacement
  emulation, or new generic transaction framework is needed.
- Add red tests from these native controls plus edge cohorts for modifier state,
  off_t and block overflow, no-create and symlinks, captured-once references,
  same-size timestamps/write-only permissions and per-target close failures.
  Add in-memory handle/race tests for rename/unlink/replacement, quota through
  aliases/wrappers, late acquisition and close, and falsey failures. Read-fault
  or unavailable-capability cases must not be counted as GNU passes.
- Only then wire per-target execution as open -> required handle metadata ->
  BigInt calculation -> admitted same-handle resize -> close, preserving native
  diagnostic and effect ordering. Keep command raw-byte/path admission, work
  budgets, portable no-Buffer execution and parent cancellation consistent with
  the preceding utilities. Root owns later public integration and independent
  stress qualification; no implementation readiness/full-parity claim is made
  by this preparation alone.

## Implementation review checkpoint: September 9, 2026

- The retained-resize and preferred-I/O contracts now have uncommitted Memory,
  Real, composition and quota implementations. Memory and the virtual null
  device deliberately report a virtual 4096-byte preferred-I/O policy; Real
  preserves only a valid native observation. These are not interchangeable
  physical-storage claims. Default Shell device composition permits the null
  target protocol; quota outside Devices conservatively refuses nonregular
  retained handles instead of bypassing accounting.
- Root reproduced three reentrant capability/acquisition-getter cancellation
  defects before fixing admission in `fs/capabilities.ts`. Its focused group
  passed 34 checks. An independent replay passed 72/72 on helper SHA-256
  `632f752377df10026c692279cadb35cf355add30435731f135810734355fed3c`.
  One probe now selects the actual post-query getter boundary rather than the
  obsolete third lookup; the other 71 are unchanged. Original 70/72 evidence
  remains in `/tmp/retained-resize-independent-20260909.json`; the new receipt
  is `/tmp/retained-resize-independent-20260909-root632-recovered-v2.json`.
- Root also reproduced two opaque quota-census cancellation barriers before
  the quota owner corrected them. Namespace `readdir`/`lstat` promises are
  interruptible with late rejection observation; acquired handle operations
  and retirement still drain. The unchanged root regressions, quota tests and
  admission-helper tests passed 105/105 in
  `/tmp/kamilio-678-quota-integration-green-v2.log` (exit 0). This source-level
  integration result is not a complete workspace or public-consumer gate.
- Exact native comparison found a remaining creation-enabled trailing-slash
  error mismatch: `/dev/null/` reports EISDIR natively, but direct Device,
  helper, scoped and Mount paths reported ENOTDIR. The eight-route observation
  retains four passes and four mismatches in
  `/tmp/issue-678-null-path-review.json`. A Device-only error mapping cannot
  fix capability-query and Mount resolution boundaries. Preserve traversal
  authorization and distinguish final separators from intermediate components;
  no blanket ENOTDIR conversion or capability bypass is authorized.
- Original `truncate.c` and `stat-size.h` were reread completely during root
  review. Nonregular references and relative targets require a retained
  SEEK_END observation, not `stat.size`. The current command explicitly refuses
  that unsupported observation; this remains a compatibility gap, not a pass.
  Creation-mode/umask effects are also part of the raw comparison contract.
- Temporary storage exhaustion interrupted some follow-up checks before launch.
  Only this task's completed artifact tree was moved, with approval, from
  `/var/tmp/poe-code-674-artifact.P0MUaM` to
  `/home/kjopek/poe-code-artifacts/poe-code-674-artifact.P0MUaM`; its detached Git
  worktree link was repaired and remained clean. Historical artifact receipts
  retain their original paths/profile. The completed clean build, full lint,
  full uncached unit run and installed-consumer confirmation on `fd72e1df2`
  qualify the preceding five local commits, not this uncommitted issue-678
  implementation. Remote mutation approval is still pending.

### Follow-up boundary and runtime validation

- A third root regression established an already-canceled acquisition after a
  post-census opener getter. The first red demanded a later getter lookup;
  the corrected red explicitly permits an earlier captured callable and still
  reproduces the actual canceled dispatch. Both receipts remain under
  `/tmp/kamilio-678-quota-reentrant-red-v1.log` and `-v2.log`. The quota fix uses
  the captured opener with the original filesystem receiver after a final
  cancellation check. Its root-three/owned/neighbor group passed 173/173 and
  scoped strict types passed. Quota source SHA-256 is
  `7909cb138e50a6992c14009fdeee71b59a7655e11c5248aa3d5610cd42c7a489`.
- The preceding SafeFS integration run passed 1963/1963 across 67 files after
  loopback permission was approved. Its first sandbox run retained three EPERM
  listener failures and an unhandled listener error. These runs predate the
  third root regression and final opener-capture fix; they are not a gate for
  those later bytes. Receipts: `/tmp/kamilio-678-fs-integration-v1.log` and
  `/tmp/kamilio-678-fs-integration-v2.log`.
- SafeFS-only development builds update its declarations and workspace files,
  but the root public `poe-code/safe-fs/core` import uses a bundle under SafeJS
  dist. Five of seven command Shell checks correctly exposed that stale facade;
  neither those failures nor the unavailable new method were normalized away.
  A full maintained `npm run build` completed successfully, including the root
  bundle stages, in `/tmp/kamilio-678-public-development-build-v2.log` (exit 0).
  Its first attempt failed on the sandbox's readonly `/var/tmp` policy, with
  the original receipt preserved. This is a development prerequisite refresh,
  not frozen final qualification; command public replay follows separately.
- The current parser cohort records 333 exact native matches and seven
  deliberately different virtual-version identities out of 340. Existing
  nonregular seek and nonzero-umask creation differences are expressly not
  native passes, even where maintained characterization assertions pass.
  Resolve the configured virtual mode policy through existing public metadata
  options rather than provider-name branching, a silent mode-0644 patch, or
  changing unrelated Memory creation behavior.

### Explicit open-intent correction

- After the root runtime rebuild, the original seven public Shell composition/
  lifecycle cases passed 7/7 in
  `out/issue-678-tmp/public-shell-after-root-v2.log` (exit 0). The first replay's
  selector covered only six lifecycle cases; that narrower receipt remains
  separate. The temporary filesystem filled again, so subsequent source-test
  scratch and receipts moved to the workspace filesystem with approval. No
  other task's files were deleted and native oracle fixture profiles were not
  silently relocated.
- Independent path review recorded 160 native utility/open observations and
  768 VFS API comparisons: 700 matched, 68 differed. A separate 32-case
  error-only Memory prototype matched its observations, but is not production
  qualification. Twelve additional expanded-symlink controls expose why an
  original-operand suffix check is insufficient. Immutable raw results and
  before/after source hashes are in
  `/tmp/issue-678-trailing-review-jVmnOx/resumed/matrix-v1.json` and its sibling
  receipts. Mount's bare dangling-create failure is a distinct boundary.
- The selected contract adds `CapabilityQueryOptions.create`: omission retains
  generic resolution, explicit false/true selects writable-open resolution.
  The root admission helper now supplies false for default no-create acquisition
  and checks cancellation after reading that intent. Root regressions reproduced
  two failures out of 26 before the correction; the helper/quota/root group then
  passed 121/121. Receipts are under `out/issue-678-tmp/creation-intent-*`.
  The first attempted patch did not apply because shell heredoc temporary
  creation hit ENOSPC; its 22 old-test passes are not red-test evidence.
- Backend resolution implementation is delegated separately: preserve separator
  provenance, parent search checks, explicit dot/dotdot behavior and mount
  confinement; return only an error from the early terminal-separator branch,
  never parent-derived positive capabilities. The ReadOnly policy view retains
  unconditional mutation denial, explicitly distinct from native readonly-mount
  error ordering. No new all-path compatibility claim is made by the root
  intent/helper tests or the earlier runtime build.
- Nonregular end-position feasibility remains unresolved. There is no validated
  portable Node/Bun retained seek implementation in this work. An optional
  retained-handle protocol was considered but not authorized or implemented;
  neither stat size nor a fabricated directory offset is an acceptable fallback.

### Registration and independent review, September 9, 2026

- Register `truncate` through the existing metadata family, forwarding its
  public umask and argument/output/entry limits. Default command membership is
  87, or 88 with one custom command. Historical frozen inventories remain
  unchanged; current-profile adapters explicitly add this command. Root
  registration, workflow and inventory controls passed 64/64 before the later
  support-declaration regression was added. Receipts are under
  `out/issue-678-tmp/registration-*` and `custom-inventory-red-v1.log`.
- The missing resize/mutation requirement reproduced a false supported result
  for an unknown-capability filesystem. Declaring `retainedResize` and mutation
  intent fixed that result without blocking help/version execution. The command
  owner reports 1450/1450 owned and registration controls, including unsupported
  and readonly help/version cases. Source SHA-256 at that point is
  `99ba23dc3440daee5ef28291a1710f7f47299c078bb652225a9bf66ec1a07eb5`;
  receipts are `out/issue-678-tmp/command-owner-20260909-v1/support-*-v1.log`.
- Mode controls explicitly cover configured umask 027, preservation of existing
  mode 0620, and creation at 0640. The command owner's 64 native comparisons
  matched under the recorded explicit-umask profile; three additional modeled
  host-mask controls are not new native captures. Real backends may additionally
  apply host umask/ACLs. Installed-consumer fixtures now cover direct, env, xargs,
  script/reference, null-device, retained-identity and quota workflows, but have
  not yet run against rebuilt candidate packages.
- Updated three superseded Memory create-with-terminal-separator expectations
  to the recorded native EISDIR outcome, and added distinct no-create controls
  preserving ENOTDIR/ENOENT. The helper/Memory/path/composition integration group
  passed 1055/1055 (`out/issue-678-tmp/path-integration-green-v1.log`). The owned
  768 native-derived matrix assertions reuse recorded expectations, not fresh
  utility executions. Nested Device-over-Mount absolute dangling aliases still
  have a validated boundary discrepancy under active correction.
- Fresh Real backend captures found seven mismatches across 18 cases, including
  a permission bypass: `blocked/../file` and its symlink alias truncated the
  existing inode despite the unsearchable `blocked` directory. GNU/open rejected
  EACCES and preserved its bytes. Other cases expose terminal-separator ordering.
  Native profile: GNU 8.30, LC_ALL=C, uid/gid 150124, umask 022, filesystem device
  66305. Evidence is in `out/issue-678-tmp/real-path-review/`; this invalidates any
  all-path claim based only on earlier mocked Real tests. Fixes are in progress.
- Independent lifecycle replay on command SHA-256 `97a0dc15ac75b737e3b6931318501aa9e5a59455d34e7001ccb817daf945c988`
  reproduced all five direct getter-abort dispatch defects (4/9 passed), while
  56/56 direct controls passed. Corrected Shell fixtures yielded 55/58 and
  isolation 7/11; three failures in each involve the older generated Device
  facade. The fourth isolation assertion incorrectly required disposal to repeat
  a command-owned close failure; its narrowly corrected replay passed while
  retaining exact null cancellation, both settlement barriers and one close.
  Diagnosed and secondary close-error leak assertions now pass unchanged.
  Invalid Memory string fixtures and wrong diagnostic-prefix expectations are
  separately recorded, never normalized in actual output. Manifest:
  `out/issue-678-tmp/lifecycle-root-review/replay-manifest-v1.json`.
- Those replay drivers catch assertions and can exit zero with failed cases;
  use their recorded case outcomes, not process status alone. Their generated
  facade predates current path/query-intent edits. The five direct command
  defects are assigned for maintained TDD; no final public, full-suite, or
  one-to-one parity claim follows from these partial development checks.

### Follow-up fixes and replay

- Command getter regressions reproduced 21 failures among 37 focused controls
  before correction. Captured callbacks now receive their original receiver
  only after a post-lookup cancellation check. Owned plus registration controls
  passed 1481/1481. Independent unchanged original drivers then passed 9/9 and
  56/56, including all five previously failing getter phases. Command source
  remained `ddba020494939ad861aa6cc8ca4a02838edfa952f015b1160c799cb14d98eae6`.
  Receipts: `command-owner-20260909-v1/getter-*` and
  `lifecycle-root-review/getter-fixed-*-v2.json` under the existing scratch root.
  The typecheck still sees old generated declarations lacking query intent;
  this is not a passing current type gate and requires the normal root rebuild.
- Real resolver correction preserves directory search checks before explicit
  dot/dotdot collapse and before create-with-terminal-separator rejection.
  Maintained TDD reproduced 12 failures, then the owned suite passed 103/103.
  Root independently ran four Real/allocation test files: 159/159 passed.
  Fresh unchanged native comparison drivers report 16/16 and 2/2 matched
  backend outcomes and selected effects at Real source SHA-256
  `f0df2066dec945f3fcc0d10aa87c9385a25423ff58224f54e004fd6fe3adf303`.
  Source hashes were unchanged across both runs. New captures are
  `real-path-review/native-api-20260909-Oat3xE/receipt.json` and
  `real-path-review/dotdot-20260909-Lj9x4G/receipt.json` under the scratch root.
  Their GNU raw bytes/statuses are retained; these direct Real API comparisons
  do not establish a rebuilt Shell-command comparison or atomic race protection.
- The broader inventory run exposed three stale assertions: default/custom
  portable counts and the inspection-family positional slice after metadata
  insertion. Exact expectations were corrected, not derived from actual output.
  Direct suites passed 42/42 and 21/21. The repeated 16-file integration command
  passed all 16 reported file-level results; that runner output does not expose
  individual case counts. Receipts: `*-inventory-direct-{red,green}-v1.log`
  and `inventory-integration-v{1,2}.log` under the scratch root.
- The maintained browser-bundle test now executes the actual new public
  truncate consumer fixture, including metadata modes, nested invocation,
  binary effects, null-device errors, retained identity and quota refusal:
  9/9 bundle tests passed (`browser-truncate-integration-v2.log`). This uses
  source-built in-memory bundles, not installed tarballs. The earlier combined
  browser/playground run had 71 passes and two stale-dist inventory failures;
  those playground checks remain pending the normal root rebuild.
- Four maintained namespace regressions independently show that Device over
  Mount interprets mounted absolute link targets in the wrong root, including
  an ordinary mounted `/dev/null` and a relative escape toward global null.
  Root approved a narrowly scoped internal symbol-keyed namespace projection,
  with original backend acquisition still authoritative. Implementation and
  wrapper/cancellation validation are pending; no public type or capability
  extension is authorized by that decision.
- Read-only remote checks now observe external main at
  `57a597de2c8e769420899b4230971fe252fbc49d`, two external issue-702 commits
  beyond the earlier 99721028 base. These are not our five local commits.
  External release run 34325920117 is in progress with its unit job running;
  other reported validation jobs passed. The latest completed release remains
  v14.0.97, published September 9, 2026 at 06:32:59 UTC. No push, issue closure,
  rebase, or remote write occurred in this follow-up.

### Retained end-seeking and current integration

- The maintained Bash runner route initially failed under sandbox EPERM on
  child-process fixtures. The same `npm run test:runner --workspace=virtual-bash`
  route passed 302/302 after approved execution outside that sandbox. Receipts:
  `out/issue-678-tmp/runner-integration-v{1,2}.log`; the direct reporting diagnostic
  preserves its seven EPERM failures separately. No runner implementation changed.
- Root now authorizes optional `seekEnd(options): Promise<bigint>` on retained
  read and resize handles. Missing/undefined remains unsupported. This consumes
  an actual retained end-seek operation, never a pathname size approximation;
  no universal native or directory capability follows from the interface.
  Scoped handles preserve the method, receiver, exact offsets, operation charges,
  combined signals and closed admission. The corrected initial scoped red had
  18 failures/2 passes; its first fixture omitted the custom backend's explicit
  resize capability and is preserved as insufficient resize evidence.
- Two additional root regressions exposed canceled seek dispatch after reading
  caller options during signal merging. The first used explicit undefined;
  the corrected typed controls return an AbortSignal and still reproduce both
  failures. The merge now checks its completed signal before dispatch. The
  four-file scope/quota/helper/metadata group passed 86/86, including 27 root seek
  controls, with no native operations or disk fixtures. Receipts:
  `out/issue-678-tmp/scoped-seek-options-{red-v1,red-v2,green-v1}.log`.
- Quota forwarding independently reproduced 18 failures/5 passes before its
  implementation, then passed 30 owned controls and 203 neighboring controls
  across six files. Seek operations preserve the existing global queue, retained
  identity, exact bigint and draining close without quota or content changes;
  read-handle forwarding remains unchanged. Source SHA-256:
  `bf8b676f9239bad5161241449eda743e6155ed623db5598efb7fab13160fa857`.
  Receipts: `out/issue-678-tmp/quota-seek-end-*`; these cohorts overlap other gates.
- Command consumption reproduced 53 focused failures, then passed 59 focused
  and 1556 owned controls at source
  `38f51b8eeba1c22efd286255cc8bf7d34423a19c67ae463f360db9e89e1c9395`.
  Regular references remain stat-only. Nonregular references acquire/read-seek/
  close before target effects, ignoring GNU reference-close failures while
  draining admitted work. Relative targets seek their same writable handle.
  Three previously mismatching null cases match original captures through
  faithful custom handles, not yet through every production backend.
- Root validated that `toFsError` lost genuine ESPIPE errors, added the errno,
  and passed the targeted error-map controls. The command adds GNU `Illegal seek`
  mapping plus 12 controls, but its current public runtime still rejects ESPIPE
  construction before command execution: 1556 pass/12 fail, not a green mapping
  gate. Command source is now
  `2706dffc10c1262134dbb51bd6a21a90fa9411e041333d504bbf536f5aedfc9e`.
  Fresh bounded GNU 8.30 captures independently confirm exact ESPIPE bytes and
  reference-stop versus target-continue effects in two owned FIFO fixtures:
  `out/issue-678-tmp/seek-errno-native-sY4DzW/receipt.json`. All keeper descriptors
  were closed. The initial sandbox EPERM receipt is preserved separately.
- The public consumer fixture now exercises the three captured null end-seek
  cases. Its browser red records ENOTSUP for relative null resizing (1 failed,
  8 passed), rather than hiding that production gap. The Device owner is assigned
  both retained Null methods after namespace work, with separate stage receipts.
  No Memory-directory policy, general native seek adapter or new read-open
  option has been implemented by this decision.
- A source typecheck during active namespace editing failed on Mount's explicit
  undefined `resizeCreate` under exact-optional typing. The owner has the concrete
  diagnostic. Full rebuild, current strict declarations, Shell lifecycle replay,
  playground checks, installed consumers, screenshots and the full gates remain
  pending stable source; partial source-bundle checks do not replace them.

### Native seek feasibility and release monitoring

- The bounded public-WASI investigation established a real Node 22.22.0/Linux
  descriptor route for regular files and explicitly opened null, including exact
  bigint offsets and actual cursor movement. It does not solve the requirement:
  directory/FIFO rights reject with ENOTCAPABLE before native seek, and inspected
  Bun behavior ignores the supplied descriptor mapping and uses a metadata-size
  approximation. Do not translate rights errors into fabricated native errno,
  ship a stat-size substitute, or claim Node/Bun parity. Original Node 8/12 and
  separate corrected 2/2 controls remain distinct; the Bun incorrect-errno
  assertion remains a failure. No WASI production integration is authorized.
  Findings and source provenance:
  `out/issue-678-tmp/seek-feasibility/research-20260909-v1/conclusion.json` and
  `manifest-v1.json`.
- Further source review supports considering an explicit virtual `linux-dx64`
  Memory directory-cookie policy: the indexed-directory terminal cookie is not
  directory storage size. The existing receipt is consistent with that profile,
  but its 0xEF53 filesystem magic alone does not identify the exact ext driver,
  kernel, indexing state or mount options. A future implementation needs pinned
  directory identity/cursor semantics and explicit directory-aware read admission,
  preserving current regular-only callers. Synthetic Mount directories currently
  lack distinct pinned identity. This remains a proposal, not authorization to
  fabricate a universal directory offset or a completed Real/Bun solution.
- Read-only monitoring verified release run 34325920117 completed successfully.
  Tag v14.0.98 points to external commit
  `57a597de2c8e769420899b4230971fe252fbc49d`, also current remote main, and was
  published September 9, 2026 at 08:14:10 UTC. One approval-review timeout was
  retried once before that check ran. The five earlier commits remain local at
  fd72e1df2; this external successful publication does not deliver them or the
  uncommitted truncate work. Remote writes remain unapproved.

### Fresh runtime qualification and actual Playground regression

- Namespace work now resolves absolute symlink targets within the selected
  backing namespace without rewriting stored targets, bypassing confinement or
  swallowing permission errors. Four owned namespace reds became four greens;
  the broader namespace gate passed 1295 controls. Retained Null readers and
  resizers now expose exact `seekEnd() = 0n`, preserving character metadata and
  EINVAL truncation. The combined namespace/Null gate passed 1322 controls and
  the final composition gate 179. These overlapping cohorts are not additive.
  Handoff: `out/issue-678-tmp/path-owner/implementation-xrI36p/namespace-null-handoff-final-v1.json`.
- Normal root development build v3 caught the new ESPIPE member missing from
  Which's exhaustive errno map. Its existing fatal stat/access controls now
  include that code. Build v4 encountered sandbox IPC EPERM; approved v5 passed
  the normal 71-workspace graph, 70 declared builds and root suffix stages.
  The one undeclared build is not a pass. All 13 selected source hashes remained
  unchanged across v5. This is a dirty-source development build, not frozen
  delivery qualification: `out/issue-678-tmp/full-development-build-v5.log`.
- The refreshed runtime exposed 15 old truncate Shell fixtures whose metadata
  namespace did not match retained memfs acquisition. The owner reproduced 18
  focused failures, repaired only the fixture's stat/lstat/access/realpath/
  readlink namespace, and passed 1577 owned-plus-registration controls. Original
  diagnostics, cancellation expectations and snapshot bytes were not changed.
  Source remains `2706dffc10c1262134dbb51bd6a21a90fa9411e041333d504bbf536f5aedfc9e`;
  test hash is `d5f667351a9caa61d33f647b832d2120ea8614172db28c5f633c1ba07aea444d`.
  Separate independent historical fixtures also exposed invalid directory
  metadata; their initial failures are retained, and corrected-fixture replays
  remain a separate cohort rather than relabeling the old receipts green.
- Maintained Bash typecheck found two complete-stat test records missing the
  newly optional preferred I/O block field under their `Required<FileStat>`
  models. The records, prototype getter and optional-field permutation inventory
  now include it. Direct overlay/readonly cohorts passed 45 and 14 controls;
  maintained typecheck v4 passed 26 current consumer groups, with the expected
  negative-consumer compiler failures and four held evidence inputs reported
  separately. This establishes declaration checking, not runtime acceptance.
- The full Safe FS development suite passed 3007 controls in 71 files after an
  approved rerun for sandbox-blocked localhost tests. Original v3 failures and
  unhandled socket EPERM remain in their receipt. Runner integration separately
  passed 302 controls. Neither is a replacement for the final uncached root gate.
- Actual screenshot inspection caught a real gap despite 73 earlier browser/
  kernel/session checks: Playground's worker bridge did not transmit retained
  open operations. Regular-file truncate returned ENOTSUP and left bytes intact.
  The red screenshot and ARIA are preserved as
  `out/issue-678-tmp/truncate-playground-v1.png` and `.aria`.
- Adding the retained bridge exposed a second real issue: the page's bespoke
  pathname quota guard leaked the raw retained resize opener. The actual-worker
  regression allowed hardlink growth past 16 MiB. The shell now uses canonical
  `withFileSystemQuota` rather than a second retained quota implementation. Its
  explicit scan limits preserve the prior unrestricted entry/depth policy;
  editor/upload limits and their serial admission remain unchanged. The red
  captured one failure/one pass; the corrected session suite passed 33 controls.
  Bridge resource-retirement and execution cleanup qualification is still in
  progress; the green unit cohort alone does not finish visual qualification.
- A separate bounded native GNU 8.30 capture verifies the exact Playground
  transcript's stdout, stderr, status, binary zero extension, hardlink identity,
  shrink effects and empty Null-reference target, without normalization:
  `out/issue-678-tmp/playground-truncate-native-CTLJKg/receipt.json`.
  Original sandbox denial remains separately recorded. No directory-cookie
  policy or general Real/Bun native end-seek support has been fabricated or
  waived by these integration fixes. Installed current-candidate consumers,
  refreshed screenshots and final full gates remain outstanding.

### Retained Playground bridge and exact visual confirmation

- The bridge now transmits pinned read/resize handle operations, optional exact
  bigint end seeking and shared stat identity scopes. Ordinary requests, active
  handles including pending acquisitions, read request sizes and identity tables
  are bounded. Close blocks admission synchronously, drains admitted operations
  before physical release and retires late acquisitions; opaque capability
  queries are not promoted into shutdown barriers. Owned bridge controls passed
  48/48. Existing non-Error RPC error serialization remains an explicitly
  unchanged limitation, not a claim of arbitrary thrown-value identity.
- Reading the execution boundary exposed an unresolved-result bug if filesystem
  retirement rejected after `finished` was set. Two tests reproduced it before
  correction. Execution now always settles after cleanup drain, retaining an
  existing nonzero/timeout outcome and surfacing cleanup-only failures. The
  complete execution cohort passed 20/20. The two-file combined 68/68 cohort
  overlaps these counts. Handoff and all intermediate reds/corrections:
  `out/issue-678-tmp/playground-retained-rpc-handoff-v1.json`.
- Root lint corrected two delayed fixture declarations and the empty fallback
  catch without changing their tested behavior. Normal root build v6 retained
  its sandbox IPC failure; approved v7 passed all declared stages and the 24
  selected source hashes remained stable. The complete Playground-plus-browser
  focused gate then passed 229 controls across nine files, including actual
  worker execution and the hardlink quota regression.
- A fresh browser reload and actual command execution now match the native
  transcript exactly: 72 stdout bytes, 70 stderr bytes and status 1. The expected
  failure is the final Null truncation, not regular-file ENOTSUP. The new PNG
  was visually inspected and the ARIA JSON strings were decoded and compared
  directly to the raw native hex, with no output normalization:
  `out/issue-678-tmp/truncate-playground-v2-comparison.json`.
  Both the red v1 and corrected v2 screenshots remain. The task-owned browser
  session was closed and verified absent; the owned Vite server was stopped.
- The first full root unit attempt failed sandbox Git discovery. Its approved
  normal `npm test` rerun stopped in the shared phase with 21779 passes, one
  failure and one skip: `agent-eval`'s real-Vitest integration reported child
  exit 1. This is not full-suite acceptance or yet an established unrelated
  defect; a bounded read-only reproduction is assigned. Later workspace phases
  and native npm post-hooks are not credited as run.
- Full root lint found two prefer-const errors in the retained composition
  tests and two unused-binding warnings in truncate fixtures. Root corrected
  only declarations/ignored-binding names; focused lint is clean and the
  affected composition/command cohorts pass 179 and 1571 controls. The preserved
  first full-lint receipt remains a failure; its normal rerun is in progress.
  Current test hashes are
  `1b39a1d2a6ee660582aafc55748dffc521d627ef8889d8c240e7a43f8fd6dd97`
  (composition) and
  `19b0d5b8fc8ae3715a27a9143442f20ca9c1d37b22b1077be654efe8541a53d7`
  (truncate). Earlier source/test hashes remain historical observations.
- Read-only release monitoring still finds v14.0.98 and successful release and
  scoped-package workflows at external commit 57a597de. No remote writes were
  made. Current installed-tarball consumers and a successful full unit graph
  remain outstanding, alongside the explicitly retained directory/native-seek
  compatibility gaps. None is waived by the exact visual transcript match.

### Full-gate environment and public artifact profile follow-up

- Independent corrected-namespace replays finished with direct 9/9, controls
  56/56, historical Shell 57/58, isolation 11/11, separately corrected held-close
  1/1 and reference-seek smoke 6/6. The preserved Shell failure expects a ninth
  opener getter lookup, but the current implementation performs eight: its
  cancellation never triggers. This is not evidence of post-abort dispatch and
  is not credited as cancellation coverage. No extra semantic-control pass is
  claimed; its approval review timed out before execution. Every historical
  assertion, exact fixture delta and source hash is retained in
  `out/issue-678-tmp/lifecycle-root-review/namespace-v6-summary.json`.
- The shared agent-eval failure was reproduced twice with workspace-local
  TMPDIR. Its child Vitest process discovers the ancestor repository config,
  whose include patterns omit the generated root-level sample. Changing only
  TMPDIR to `/tmp` discovers the intended two child cases and passes the outer
  test. Source/config hashes were unchanged; no product or test edits were made.
- The resulting full-unit v4 rerun passed that test but exposed three real-host
  lint-guard fixture failures: `/tmp` contains 51444 entries, above the unchanged
  30000-entry per-directory cap. The 21777 passes, three failures and one skip
  remain a failed shared phase. No temporary files were broadly removed and no
  guard limits were increased. An approved owned directory under `/var/tmp`
  avoids both ancestor config discovery and the oversized `/tmp` ancestor;
  both affected test files pass all 273 controls there. The normal full graph
  v5 is now running with that explicit temporary-root profile.
- Full root lint v2 passed with 10453 configured/linted subjects, no errors or
  warnings, followed by repository TypeScript and workflow lint. The subsequent
  public-type fixture addition is separately checked by strict installed
  NodeNext compilation and focused lint. It exercises read/resize type parity
  between public Bash and FS entries, create intent, preferred block metadata,
  optional exact bigint seeking and retained close.
- Initial installed development tarballs passed Node, Bun and strict NodeNext
  consumers, but browser bundling failed on `node:stream/web`. The receipt is
  not a green publication gate. Inspection found the intervening normal unit
  graph had rebuilt the Bash workspace, replacing `dist/core.browser.js` with
  its 67-byte source facade after the root build. Root's normal bundle suffix
  supplies the browser platform adapter; the scoped release workflow builds
  that suffix before packaging and does not interpose this workspace rebuild.
  Requalification requires a fresh normal root build after the unit graph,
  then newly packed artifacts with no competing emitter. Do not repair this
  profile mistake with a consumer shim or relabel the failed tarball green.
  Initial artifacts and hashes remain at `/tmp/truncate678-public.uOC8Tm` and
  `out/issue-678-tmp/current-public-tarball-v2.sha256`.

### Full Bash gate and coherent errno milestone

- Full unit v5 progressed through shared 21780 passes/one skip and runner 302
  passes, then stopped in the Bash phase with 26296 passes, six failures and
  63 skips. Later SafeJS/terminal/posttest phases are not credited. Readonly
  namespace/capability assertions, scoped capability identity and one pipeline
  dispatch expectation are under targeted correction and explicit review.
- The packed S3 export failure is a concrete mixed-revision compilation error,
  not an established S3 runtime defect: the verifier archives committed HEAD
  fd72e1df while consuming the current checkout FS peer. That peer now declares
  ESPIPE, but committed Which's exhaustive map lacks it. The actual child and
  focused replay both fail with TS2741 before packaging/runtime export checks.
  Do not change archive diagnostics, omit controls or substitute another profile
  to make this gate appear green. Evidence:
  `out/issue-678-tmp/command-owner-20260909-v1/s3-exports-diagnosis-v1.json`.
- The narrow errno correction is independently separable from unfinished
  truncate support: preserve ESPIPE in the canonical FS error type/mapping and
  add its description to Which's exhaustive map. The original normalization
  regression is moved unchanged into a standalone FS error test, with one
  constructor/identity control. Four FS error/platform controls and 13 Which
  controls pass; focused lint is clean. A local atomic commit of only this
  correction, its tests and this plan can restore committed-source/peer
  coherence without claiming the new utility complete. Remote push/issue
  mutation remains separately unapproved; no release delivery is implied.
- Root also reproduced three absent/negative capability identity regressions.
  The resize normalizer now preserves an unpromised capability object unchanged
  and only revokes affirmative unsupported/readonly promises. All 90 helper,
  scoped-seek and quota-neighbor controls passed at that checkpoint. This
  uncommitted correction remains separate from the errno milestone.
