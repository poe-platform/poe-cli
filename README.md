# poe-code

> Configure local developer tooling to use the Poe API.

## Quick Start

```bash
npx poe-code configure claude-code
```

## Features

- ⚙️ **Single CLI** to provision Claude Code, Codex, OpenCode, and Roo Code.
- 🧩 **Provider-aware adapters** that install binaries, render config templates, and manage prerequisites.
- 🧪 **Dry-run mode** showing every file mutation before it happens.
- 🛠️ **Composable registries** so new providers can be added without touching the CLI core.

## Installation

```bash
npm i -g poe-code
```

## Usage

### Authenticate Once

```bash
poe-code login
```

### Configure Coding CLIs

```bash
# Claude Code
poe-code configure claude-code

# Codex
poe-code configure codex

# OpenCode
poe-code configure opencode

# Roo Code
poe-code configure roo-code
```

### Spawn a One-Off Task

Run a single prompt through a configured service:

```bash
# Claude Code
poe-code spawn claude-code "Explain this error message"

# Codex
poe-code spawn codex "Summarize the latest changes"

# OpenCode
poe-code spawn opencode "List all TODO comments"
```

### Optional Flags

- `--dry-run` – show every mutation without touching disk.
- `--verbose` – print shell commands as they run.
- `--yes` – accept defaults for prompts.

## Beta Workspace

Looking for the interactive agent or VSCode extension?
Those experimental features now live in [`beta/`](beta/README.md) under the `poe-code-beta` package.
