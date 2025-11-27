# Provider Service Simplification Plan

## Goals

- Eliminate the “adapter vs service” split so each provider exposes a single object that resolves paths, installs, configures, removes, and spawns.
- Remove intermediate helper exports (`configureFoo`, `removeFoo`, etc.) and run manifests directly inside the service implementation.
- Stop piping mutation hooks (or any execution metadata) through option payloads; services should derive everything from context.
- Ensure CLI commands and utilities interact with the streamlined service shape without reintroducing proxy layers.

## Tasks

1. **Define a Single Service Shape**
   - Update `ProviderService` so `configure`/`remove` receive only business options; hooks and other execution details live on the context.
   - Strip `mutationHooks` (and similar wiring) from all configure/remove option types and command payload builders.

2. **Inline Manifest Execution**
   - Keep each `createServiceManifest` result private (`const fooManifest = …`) and delete exported wrapper functions.
   - Inside the service’s `configure`/`remove`, map the CLI context + resolved paths into the manifest options and call `fooManifest.configure/remove` directly.
   - Any provider-specific glue (spawn helpers, prerequisite registration) stays in the same module next to the manifest call.

3. **Centralize Hook Handling**
   - Add a small utility that inspects the provider context for mutation hooks and returns `{ hooks } | undefined`.
   - Invoke that helper inside every service `configure`/`remove` so no service repeats the hook plumbing.

4. **Update Registry Consumers**
   - Adjust the service registry, CLI commands, service menu, label generator, etc., to depend on the single service object (no casting, no secondary exports).
   - Ensure command payload builders no longer inject hooks or proxy data; they should return only provider-specific options.

5. **Prune Legacy Types and Imports**
   - Remove unused type aliases (`InstallFooOptions`, configure/remove option exports meant for the old helpers) and fix imports accordingly.
   - Drop any references to the deleted helpers throughout the repo so only the service object remains as the integration point.
