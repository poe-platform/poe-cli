# Provider Service Simplification Plan

## Goals

- Keep a single provider service per tool while expressing configure/remove work declaratively through manifests.
- Drop redundant helpers or proxies so the manifest and service live side by side in the same module.
- Share only truly generic helpers (chmod mutation, single-quote escaping) from `src/providers/provider-helpers.ts`.
- Leave the README untouched unless explicitly asked.

## Tasks

1. **Declarative configure/remove**
   - For each provider (Claude Code, Codex, OpenCode) describe filesystem, template, JSON, and script work as `ServiceMutation[]` definitions.
   - Pass those definitions to `createProvider` so it builds the manifest and surfaces configure/remove without extra wrappers.

2. **Single service entity**
   - Export exactly one `ProviderService` per provider; eliminate `configureFoo`, `spawnFoo`, `registerFooHooks`, or similar proxy exports.
   - Keep install/spawn/hook logic colocated with the service so there is no second layer of indirection.

3. **Shared helpers only when generic**
   - Keep reusable helpers such as chmod mutations or single-quoted path rendering inside `src/providers/provider-helpers.ts`.
   - Push provider-specific details (scripts, JSON shapes, template contexts) into the provider module rather than scattering helper files.

4. **CLI + registry alignment**
   - Make sure CLI commands and the service registry call the provider services directly.
   - Let the manifest executor surface logging/instrumentation so providers do not replicate boilerplate for hooks or dry-run reporting.
