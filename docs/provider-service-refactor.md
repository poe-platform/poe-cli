# Provider Service Simplification Plan

## Goals

- Collapse “manifest + adapter” into a single provider service object per provider.
- Eliminate helper/proxy exports (`configureFoo`, `spawnFoo`, `registerFooPrerequisites`, etc.) so logic lives directly on the service.
- Share the tiny building blocks (chmod, path quoting, key-helper removal) via `src/providers/provider-helpers.ts` instead of bespoke helpers.
- Leave README untouched until explicitly approved.

## Tasks

1. **Single Service Definition**
   - Make `ProviderService` the only export for a provider. The service should directly expose `id`, `summary`, `configure`, `remove`, `install`, `spawn`, `resolvePaths`, and `registerPrerequisites` (if any) without intermediate wrappers.
   - Build whatever manifest/mutation arrays are required inline inside the same module, but keep them private helpers; no spreading or `Object.assign` to stitch objects together.

2. **Inline Mutation Execution**
   - Define the configure/remove mutation lists next to the service and execute them directly inside `service.configure`/`service.remove` via a thin runtime helper (e.g., `runServiceMutations`).
   - Delete `runServiceManifest`, `configureFoo`, `removeFoo`, `spawnFoo`, `registerFooPrerequisites`, and every other proxy export—the service owns the full flow.
   - Drop legacy flag plumbing such as `mutationHooks`; services should derive execution metadata from context rather than threading options.

3. **Move Shared Helpers**
   - Relocate generic utilities (`makeExecutableMutation`, chmod helpers, path quoting, key-helper removal, etc.) into `src/providers/provider-helpers.ts`.
   - Ensure provider modules import these shared helpers instead of redefining tiny wrappers.

4. **Update Consumers**
   - Point every CLI command, registry lookup, lint/test helper, and any tool that shells into providers directly at the service object—no helper imports remain.

5. **Clean Up Types & Tests**
   - Delete configure/remove option interfaces that only existed for the old helper exports.
   - Update tests to call the consolidated service (or the CLI command that uses it). Tests must stay valuable—remove or rewrite cases that only existed to cover the deleted proxies.
