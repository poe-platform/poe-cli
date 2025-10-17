<!-- Important: This document must be kept up to date! -->
# Poe Setup Scripts

Poe CLI is a Node.js toolkit that streamlines connecting local developer tools to the Poe API. It can bootstrap sample Python projects, configure IDE agents such as Claude Code and Codex, and generate an npm placeholder package to reserve the `poe-cli` name.

## Features
- Bootstrap a ready-to-run Python starter that calls the Poe API.
- Configure Claude Code and Codex to proxy Anthropic/OpenAI requests through Poe.
- Remove or restore configurations with automatic timestamped backups.
- Generate a publishable placeholder npm package in one command.
- Run any command in `--dry-run` mode to preview filesystem writes.
- Remember your Poe API key automatically (prompt, flag, or `login`) and wipe it with `logout`.
- Validate credentials end-to-end with the built-in `test` command (calls the Poe EchoBot).

## Prerequisites
- Node.js 18 or newer (`package.json` enforces this via the `engines` field).
- A Poe API key for interactive commands (stored in your shell or passed on the CLI).
- For global installs, ensure your npm global bin directory is in `PATH`.

## Installation

```bash
# Run without installing (recommended)
npx poe-cli --help

# Install globally
npm install -g poe-cli

# Local development setup
git clone <your-fork-url>
cd poe-setup-scripts
npm install
npm run build
npm link  # optional: exposes `poe-cli` from the local dist build
```

Local

`npm run build`
`npm install -g .`


## Quick Start

```bash
# Interactive usage (prompts for missing values)
npx poe-cli init

# Store your Poe API key once
npx poe-cli login --api-key YOUR_KEY

# Configure tools
npx poe-cli configure claude-code
npx poe-cli configure codex --model gpt-5 --reasoning-effort medium

# Remove configurations
npx poe-cli remove claude-code
npx poe-cli remove codex

# Verify credentials
npx poe-cli test

# Query a model (defaults to Claude-Sonnet-4.5)
npx poe-cli query "Hello there"

# Reserve the npm package name (prompts for package name)
npx poe-cli publish-placeholder --output ./placeholder-package

# Or specify the package name directly
npx poe-cli publish-placeholder --name my-package-name --output ./placeholder-package

# Inspect changes without writing to disk
npx poe-cli --dry-run configure claude-code --api-key YOUR_KEY
```

## CLI Reference

### Global Flags
- `--dry-run` – wraps the filesystem with an in-memory recorder so you can audit the planned writes. The command prints a summary plus the individual operations that would run.
- `--verbose` – prints each prerequisite check and mutation step as it executes (silenced by default).

### `init`
Scaffolds a Python project configured to call the Poe API.

```bash
poe-cli init [--project-name <name>] [--api-key <key>] [--model <model>]
```

- Prompts for missing arguments (project name, API key, model) using `prompts`.
- Fails fast if the target directory already exists.
- Generates `.env`, `main.py`, and `requirements.txt` from Handlebars templates stored under `src/templates/python/`.
- Automatically persists the provided API key (skipped in `--dry-run` mode).

### `configure`
Sets up editor integrations.

```bash
poe-cli configure <service> [--api-key <key>] [--model <model>] [--reasoning-effort <level>]
```

- `claude-code` – writes `~/.claude/settings.json` with `POE_API_KEY`, `ANTHROPIC_API_KEY`, and `ANTHROPIC_BASE_URL`. Before and after writing configuration it verifies that the `claude` CLI is available (`which claude`) and that `claude -p 'Output exactly: CLAUDE_CODE_OK' --output-format text` responds with `CLAUDE_CODE_OK`.
- `codex` – writes `~/.codex/config.toml` (creating the directory as needed) from the `codex/config.toml.hbs` template; includes model and reasoning effort settings.
- Stores any supplied or prompted API key for future commands (unless run with `--dry-run`).
- Add `--verbose` to stream each prerequisite and mutation step; otherwise only the final summary is printed (dry-run still reports planned filesystem writes).

### `prerequisites`
Executes only the prerequisite checks for a service.

```bash
poe-cli prerequisites <service> <phase>
```

- `phase` must be `before` or `after`. Use it to test environment readiness (`before`) or post-run health checks (`after`) without touching the filesystem.
- Currently supports `claude-code` (runs the `which claude` probe and the `claude` health check). Other services succeed immediately when no prerequisites are defined.
- Combine with `--verbose` to see the exact commands run. Works with `--dry-run`; it reports the planned execution while skipping any filesystem writes.

### `remove`
Restores or removes configuration for a given service.

```bash
poe-cli remove <service>
```

- Removes manifest-managed configuration only (settings JSON keys/files); leaves unrelated content intact.
- Backups created during `configure` remain available for manual restoration.
- Returns exit code `0` when nothing has to be removed.
- Add `--verbose` to watch each cleanup mutation as it executes.

### `login`
Persists a Poe API key for future commands.

```bash
poe-cli login [--api-key <key>]
```

- Prompts for the key when `--api-key` is omitted.
- Stores credentials at `~/.poe-cli/credentials.json` (JSON file with `{ apiKey }`).
- Prints the credential path after storing (and in dry-run mode).
- Supports `--dry-run` via the standard recorder.

### `logout`
Deletes the stored Poe API key.

```bash
poe-cli logout
```

- No-ops (and exits successfully) when no credentials are on disk.
- Works with `--dry-run`, showing the planned deletion.

### `test`
Confirms that the current Poe API key works by querying EchoBot.

```bash
poe-cli test [--api-key <key>]
```

- Uses the stored key by default, falling back to CLI option or an interactive prompt.
- Sends `"Ping"` to the `EchoBot` model and expects the same text back.
- Respects `--dry-run` by skipping the network request and logging the planned verification.

### `publish-placeholder`
Creates a minimal package you can publish to reserve a package name on npm.

```bash
poe-cli publish-placeholder [--name <name>] [--output <dir>]
```

- `--name` – the package name to reserve (prompts if not provided)
- `--output` – target directory for the placeholder package (defaults to `placeholder-package`)
- Produces `package.json`, `index.js`, and `README.md` at the target directory.
- Defaults to version `0.0.0-placeholder` with an executable that prints a friendly placeholder message.
- After generating the package, run `npm publish <output-dir>` to reserve the name on npm.

## Generated Files & Templates

| Command | Target | Template | Notes |
| --- | --- | --- | --- |
| `init` | `<project>/.env` | `src/templates/python/env.hbs` | Injects `POE_API_KEY`, base URL, and default model. |
| `init` | `<project>/main.py` | `src/templates/python/main.py.hbs` | Demonstrates a chat completion request. |
| `init` | `<project>/requirements.txt` | `src/templates/python/requirements.txt.hbs` | Pins `openai` and `python-dotenv`. |
| `configure claude-code` | `~/.claude/settings.json` | _n/a_ | Persists Poe keys (POE/Anthropic) for tooling. |
| `configure codex` | `~/.codex/config.toml` | `src/templates/codex/config.toml.hbs` | Sets model provider configuration. |

Template rendering is handled by `src/utils/templates.ts` using Handlebars. Add additional templates under `src/templates/` and reuse the helper to keep everything consistent.

## Dry Run Mode

When `--dry-run` is supplied, the CLI swaps the filesystem dependency with `createDryRunFileSystem` (`src/utils/dry-run.ts`). The command executes fully, but instead of touching disk it records a list of intended operations (mkdir, writeFile, unlink, etc.) and prints them after the summary so you can review the plan safely.

## Development Workflow

```bash
npm install         # install dependencies
npm run dev         # run the CLI via tsx
npm run build       # compile TypeScript and copy templates into dist
npm test            # execute the Vitest suite (required before committing)
```

- During development, run commands without rebuilding via `npm run dev -- <command>`. For example:

  ```bash
  npm run dev -- configure claude-code --api-key YOUR_KEY
  npm run dev -- test
  ```

- Follow the guidelines in `AGENTS.md` (`TDD`, `SOLID`, `YAGNI`, and `KISS`).
- Keep documentation in sync with feature changes—update this README, command help text, and templates together.
- Builds output to `dist/`; the published package exposes `dist/index.js` as the `poe-cli` binary.

## Testing

- `npm test` runs `vitest run`. Use `npm test -- --watch` during TDD.
- Filesystem interactions are exercised against `memfs` volumes through the `FileSystem` abstraction in `src/utils/file-system.ts`. Tests must not write to the real disk.
- Prefer adding focused unit tests alongside each command/service before implementing new behaviour.

Example test snippet:

```typescript
import { Volume, createFsFromVolume } from "memfs";
import type { FileSystem } from "../src/utils/file-system.js";

const volume = Volume.fromJSON({});
const fs = createFsFromVolume(volume).promises as unknown as FileSystem;
```

## Project Structure

- `src/index.ts` – CLI entrypoint that wires `commander`, prompts, and dependencies.
- `src/cli/program.ts` – command registration and shared wiring (dry-run orchestration lives here).
- `src/commands/` – feature-specific command implementations (`init`, `publish-placeholder`, etc.).
- `src/services/` – service adapters (Claude Code, Codex) including backup logic.
- `src/utils/` – shared helpers for backups, dry runs, templates, and filesystem abstractions.
- `tests/` – Vitest suites mirroring the command/service structure.

## Roadmap

- [x] Replace backup-based removal with pure pattern matching for Claude Code and Codex.
- [x] Introduce login/logout commands to securely store the Poe API key.
- [x] Add a `test` command that pings the Poe EchoBot to validate credentials end-to-end.
- [x] claude code should create/edit config json see docs/claude-code.md
- [x] Add command `query` <model> <text> that will query openai compat api with api key and return the response
- [x] query - model should be optional, default to Claude-Sonnet-4.5, maybe use --model argument


## Architecture revamp

We are reshaping the `services/` layer so every integration can be described declaratively. The CLI should be able to “read” a service definition, prime prerequisites, execute file mutations, or render a dry-run without bespoke glue code.

### Goals
- Treat each provider as a manifest that lists what must exist (files, directories, JSON keys) instead of embedding imperative logic in command handlers.
- Keep the happy-path simple (`configure` applies the manifest; `remove` walks the inverse) while leaving room for provider-specific checks.
- Make dry-run output deterministic by driving it from the same manifest objects we use during real execution.
- Ensure prerequisites are explicit, reusable, and testable in isolation.

### Building blocks
- **Service manifest module** – each service keeps a single TypeScript file under `src/services/<service>.ts`. Export a declarative manifest (plain data, no side effects) plus any tiny helper types the engine needs. The module still exports the imperative helpers for CLI wiring, but they delegate to the shared runner using the manifest definition.
- **Mutations** – normalised operations executed by the shared runner:
  - `ensureDirectory({ path })`
  - `writeTemplate({ target, templateId, context })`
  - `jsonDeepMerge({ target, templateId, strategy })`
  - `removeJsonKeys({ target, keys })`
  - `removeFile({ target, whenEmpty })`
- **Execution engine** – a thin utility that accepts a manifest, a `FileSystem`, and the `DryRunRecorder`. It loops over the mutations, dispatching to the correct helper (real or dry-run). Failures are surfaced with manifest/step context to aid debugging.
- **Removal manifest** – optional mirror that lists cleanup operations. When omitted, we derive the inverse automatically (`jsonDeepMerge` ⇢ `removeJsonKeys`, `writeTemplate` ⇢ `removeFile` when untouched).

### Prerequisites
- `PrerequisiteManager` continues to orchestrate **before** (environment validation) and **after** (health checks) steps.
- Each manifest references prerequisite IDs. Registration happens in `register<Service>Prerequisites`, keeping the implementations collocated with the manifest.
- Prerequisites should be idempotent, surface actionable errors, and rely on the injected `commandRunner`.

### Testing strategy
- Every manifest ships with unit tests that run against `memfs`, asserting:
  1. The positive path applies all declared mutations.
  2. `Dry-run` produces the expected operation list.
  3. Cleanup removes only manifest-owned keys/files (leave user content intact).
- Health checks and failure branches are covered by targeted tests around the prerequisite functions.

### Common patterns

`json_file_deep_merge(json_filename, json_handlebars_template)`
- Read the existing file (treat missing as `{}`) and deserialize to a plain object.
- Render the Handlebars template with the manifest context and parse it back into JSON.
- Perform a deep merge that keeps user customisations unless they overlap with manifest-managed keys.
- During cleanup walk the merged tree from the deepest level upwards, removing keys that match the manifest payload and pruning empty parents.
- Tests should execute the merge in memory, assert the intermediate diff, and confirm the prune logic restores the original content.
