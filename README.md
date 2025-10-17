<!-- Important: This document must be kept up to date! -->
# The name poe-cli is taken, we need a new name 

# Poe Setup Scripts

Poe CLI connects your local developer tools to the Poe API in minutes.

```bash
npx poe-cli configure claude-code
```

- Injects your Poe credentials into Claude Code via a guided flow.
- Supports dry-run mode so you can preview filesystem changes safely.

## What You Get
- Ready-to-run Python starter that already talks to Poe.
- One-command configuration for Claude Code and Codex.
- Automatic backups so you can undo integrations without fear.

## Install Options

```bash
# Run without installing (recommended)
npx poe-cli --help

# Install globally
npm install -g poe-cli
```

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

## Dry Run Mode

When `--dry-run` is supplied, the CLI swaps the filesystem dependency with `createDryRunFileSystem` (`src/utils/dry-run.ts`). The command executes fully, but instead of touching disk it records a list of intended operations (mkdir, writeFile, unlink, etc.) and prints them after the summary so you can review the plan safely.

## Further Reading

- `DEVELOPMENT.md` – contributor setup, workflows, and testing guidance.
- `ARCHITECTURE.md` – overview of the declarative service model that powers the CLI.
