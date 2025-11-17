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

## Automation Labels

Agent labels used by workflows are generated via:

```bash
npm run labels:generate
```

See the generated definitions in `docs/LABELS.md`. Assigned issues trigger the `Poe Code` GitHub workflow, which uses these labels to pick an agent automatically.
