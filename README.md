# poe-code

> Configure coding agents to use the Poe API.

## Quick Start

```bash
npx poe-code@latest configure claude-code
```

## Usage

### Authenticate Once

```bash
npx poe-code@latest login
```

### Configure Coding CLIs

```bash
# Claude Code
npx poe-code@latest configure claude-code

# Codex
npx poe-code@latest configure codex

# OpenCode
npx poe-code@latest configure opencode

# Kimi
npx poe-code@latest configure kimi

```

### Install Coding CLIs

```bash
# Claude Code
npx poe-code@latest install claude-code

# Codex
npx poe-code@latest install codex

# OpenCode
npx poe-code@latest install opencode

# Kimi
npx poe-code@latest install kimi
```

### Uninstall Configuration

```bash
npx poe-code@latest remove codex
```

Removes the Codex settings previously applied by `npx poe-code@latest configure codex`.

### Test Configuration

```bash
npx poe-code@latest test codex

npx poe-code@latest test --stdin codex
# Verifies that stdin prompts work by running a tiny spawn and expecting `STDIN_OK`.
```

### Spawn a coding agent

```bash
# Claude Code
npx poe-code@latest spawn claude-code "Explain this error message"

cat prompt.txt | npx poe-code@latest spawn codex
# Reads the prompt from stdin (supported by `codex`).
```

### Optional Flags

- `--dry-run` – show every mutation without touching disk.
- `--yes` – accept defaults for prompts.
- `-C, --cwd <path>` – run `spawn` from a specific working directory so provider CLIs see the right project files.
