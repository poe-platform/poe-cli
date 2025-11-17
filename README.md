# poe-code

> Configure local developer tooling to use the Poe API.

## Quick Start

```bash
npx poe-code configure claude-code
```

## Installation

```bash
npm i -g poe-code
```

## Usage

### Authenticate Once

```bash
poe-code login
```

### Install Coding CLIs

```bash
# Claude Code
poe-code install claude-code

# Codex
poe-code install codex

# OpenCode
poe-code install opencode
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

### Spawn a coding agent

```bash
# Claude Code
poe-code spawn claude-code "Explain this error message"
```

### Optional Flags

- `--dry-run` – show every mutation without touching disk.
- `--verbose` – print shell commands as they run.
- `--yes` – accept defaults for prompts.

## Beta Workspace

Looking for the interactive agent or VSCode extension?
Those experimental features now live in [`beta/`](beta/README.md) under the `poe-code-beta` package.
