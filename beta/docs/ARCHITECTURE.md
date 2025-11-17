# Architecture

## CLI Runtime

The CLI now boots through a lightweight runtime that composes the following
building blocks:

- **`CliContainer`** centralises shared dependencies (file system, prompts,
  HTTP client, command runner, chat factory) and exposes typed helpers:
  - `loggerFactory` and the `ScopedLogger` facade keep verbosity/dry-run logic
    consistent across commands.
  - `contextFactory` produces command contexts that wrap mutation recording,
    dry-run file systems, and prerequisite managers.
  - `options` encapsulates prompting and persistence for shared flags such as
    API key, model, and reasoning effort.
  - `poeApiClient` owns all Poe HTTP interactions.
- **`ServiceRegistry`** holds `ProviderAdapter` instances, emits telemetry for
  every operation (`install`, `configure`, `remove`, `spawn`, `prerequisites`),
  and supports discovery through `registry.discover(...)` so future plugins or
  config files can register providers without touching core wiring.
- **Provider adapters** live in `src/providers`. Each adapter resolves its own
  path configuration, registers prerequisites, and implements the optional
  lifecycle hooks (`install`, `configure`, `remove`, `spawn`). Command modules
  never branch on provider names; they request the adapter and pass shaped
  payloads.
- **Command modules** under `src/cli/commands` export `register(program,
  container)` functions. `src/cli/program.ts` simply bootstraps `Commander` and
  defers to these modules, keeping the entry point declarative.
- **Shared utilities** (`context.ts`, `logger.ts`, `options.ts`, `prompts.ts`)
  provide the common behaviours that used to be embedded in `program.ts`.

This runtime keeps CLI actions testable: commands assemble execution resources
from the container and delegate actual mutations or subprocesses to providers
and manifests.

## Declarative Service Model

The CLI is moving toward a declarative service model so every integration can be
described through manifests. Command handlers read the manifest definition,
prime prerequisites, and execute mutations (or render a dry run) without
scattered imperative glue code.

## Goals
- Treat each provider as a manifest listing required files, directories, and
  JSON keys instead of embedding bespoke logic in command handlers.
- Keep the happy path simple: `configure` applies the manifest, `remove` walks
  the inverse, while still allowing provider-specific checks.
- Make dry-run output deterministic by driving it from the same manifest data
  used during real execution.
- Ensure prerequisites are explicit, reusable, and isolated for testing.

## Building Blocks
- **Service manifest module** – Each service exports a single manifest from
  `src/services/<service>.ts`. The module may keep tiny helpers for CLI wiring,
  but imperative logic delegates to the shared runner using the manifest data.
- **Mutations** – Normalised operations executed by the shared runner:
  - `ensureDirectory({ path })`
  - `writeTemplate({ target, templateId, context })`
  - `jsonDeepMerge({ target, templateId, strategy })`
  - `removeJsonKeys({ target, keys })`
  - `removeFile({ target, whenEmpty })`
- **Execution engine** – A thin utility that accepts a manifest, a `FileSystem`,
  and the `DryRunRecorder`. It loops over the mutations, dispatches to the
  corresponding helper (real or dry-run), and surfaces failures with manifest
  context to aid debugging.
- **Removal manifest** – Optional mirror listing cleanup operations. When
  omitted we derive the inverse automatically (`jsonDeepMerge` ⇢ `removeJsonKeys`
  and `writeTemplate` ⇢ `removeFile` when untouched).

## Prerequisites
- `PrerequisiteManager` orchestrates **before** (environment validation) and
  **after** (health checks) phases.
- Each manifest references prerequisite IDs. Registration lives in
  `register<Service>Prerequisites`, keeping implementations colocated with the
  manifest.
- Prerequisites stay idempotent, surface actionable errors, and rely on the
  injected `commandRunner`.

## Testing Strategy
- Every manifest ships with unit tests running against `memfs`, asserting:
  1. The happy path applies all declared mutations.
  2. Dry-run mode produces the expected operation list.
  3. Cleanup removes only manifest-owned keys/files, leaving user content intact.
- Health checks and failure branches receive targeted tests around the
  prerequisite functions.

## Common Patterns

### `json_file_deep_merge(json_filename, json_handlebars_template)`
- Read the existing file (treat missing as `{}`) and deserialize to a plain
  object.
- Render the Handlebars template with the manifest context and parse it back
  into JSON.
- Perform a deep merge that keeps user customisations unless they overlap with
  manifest-managed keys.
- During cleanup walk the merged tree from the deepest level upwards, removing
  keys that match the manifest payload and pruning empty parents.
- Tests exercise the merge in memory, assert the intermediate diff, and confirm
  the prune logic restores the original content.
