# poe-code

> Configure local developer tooling to use the Poe API.

## Quick Start

```bash
npx poe-code@latest configure claude-code
```

## Usage

### Authenticate Once

```bash
npx poe-code@latest login
```

### Install Coding CLIs

```bash
# Claude Code
npx poe-code@latest install claude-code

# Codex
npx poe-code@latest install codex

# OpenCode
npx poe-code@latest install opencode
```

### Configure Coding CLIs

```bash
# Claude Code
npx poe-code@latest configure claude-code

# Codex
npx poe-code@latest configure codex

# OpenCode
npx poe-code@latest configure opencode

```

### Uninstall Configuration

```bash
npx poe-code@latest remove codex
```

Removes the Codex settings previously applied by `npx poe-code@latest configure codex`.

### Spawn a coding agent

```bash
# Claude Code
npx poe-code@latest spawn claude-code "Explain this error message"
```

### Optional Flags

- `--dry-run` – show every mutation without touching disk.
- `--verbose` – print shell commands as they run.
- `--yes` – accept defaults for prompts.
