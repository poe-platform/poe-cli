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

### Optional Flags

- `--dry-run` – show every mutation without touching disk.
- `--verbose` – print shell commands as they run.
- `--yes` – accept defaults for prompts.

## Beta Workspace

Looking for the interactive agent, VSCode extension, or spawn workflows?  
Those experimental features now live in [`beta/`](beta/README.md) under the `poe-code-beta` package.
