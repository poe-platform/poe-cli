<!-- Must keep this document up to date -->
# Roadmap

## CLI

- [x] `login` should mention where to get teh api key https://poe.com/api_key. WHen pasting the key, it should not be shown (treat as password)
- [x] Add option `spawn` analogous to configure/remove
    - it should take prompt and any arbitrary arguments that are passed through to the agent call
    - this must live in the service definition
    - we should utilize it for the checks like this thing `Output exactly: CLAUDE_CODE_OK`
    - not all agents support it, only claude-code, codex, opencode
- [x] should be interactive per default
    `poe-setup` -> interactive
    `poe-setup connfigure` -> show options

### CLI Architecture

- [x] Extract command bootstrap into a thin module that wires Commander and defers route registration to dedicated command files.
- [x] Move environment and path resolution into a reusable `CliEnvironment` helper consumed by commands and providers.
- [x] Introduce a `ServiceRegistry` (or similar) that abstracts provider discovery and dispatch instead of hard-coded `if` chains.
- [x] Wrap shared dependencies (prompts, fs, http client, command runner) in a container passed to command/provider factories to improve testability.
- [x] Define a `ProviderAdapter` contract (install/configure/remove/spawn/prereqs) and migrate existing providers to implementations.
- [x] Consolidate provider-specific path definitions into config objects owned by the providers.
- [x] Delegate spawn handling to provider adapters so the CLI core simply forwards requests.
- [x] Split each CLI command into its own module exposing `register(program, deps)` to keep `program.ts` declarative.
- [x] Extract shared option resolvers (API key, model, reasoning effort) into composable helpers that commands reuse.
- [x] Provide dedicated handlers for interactive/default actions that can be swapped without touching every command.
- [x] Promote `createCommandContext`, dry-run recording, and mutation logging into a shared utility module.
- [x] Introduce a logger facade that standardizes verbose and dry-run output handling.
- [x] Replace direct HTTP calls with a Poe API client abstraction responsible for error handling.
- [x] Centralize prompt schemas so providers declare required inputs without wiring prompt logic manually.
- [x] Document the new provider and command registration architecture in `ARCHITECTURE.md`.
- [x] Add telemetry hooks at the registry layer so new commands inherit consistent success/failure reporting.
- [x] Prepare for dynamic provider discovery (e.g., config-driven or plugin-based) to scale integrations.
- [x] Once modularized, cover the registry/command boundaries with integration-style tests.

- [x] Update Codex provider to store bearer token configuration without auth.json.


## Extension redesign

- [x] Single pane layout, only the chat interface
- [x] Dedicated chat history page
- [x] Top right menu items (from right)
    - New message
    - Settings
    - Chat history
- [x] Smaller font

## WIP (do not implement) Poe Agent
- [ ] Ability to spawn any supported sub-agents (including new worktrees) (add specialized tool for this)
- [ ] configure utility should store in the own json config file also which agents are config and offer those dynamically in the tool description

## Code quality

- [x] make sure that `credentialsPath` `.poe-setup/credentials.json` is defined in 1 single place, so it can be changed easily

## VSCode extension

- [x] Visualize tool calls interleaved in the messages, make it look nice


## Worktrees spawn-git-worktree <agent> 

- [x] Automatically create a new worktree somewhere in tmp (make sure this works on all platforms)
- [x] Spawn agent with given prompt 
- [x] use import simpleGit from 'simple-git';
- [x] when no git repo is present in cwd, fail early
- [x] After completion, automatically merge git commits if any, automatically merge any file changes (or new files, deletions) into the main repo
- [x] when conflicts happen, have the same agent resolve them, provide command to run and resolve conflicts. 
