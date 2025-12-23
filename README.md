# poe-code

> Configure coding agents to use the Poe API.

## Try it out

```bash
npm install -g poe-code

poe-claude --help
poe-codex --help
poe-opencode --help
```

## Permanent Configuration

### Configure Coding CLIs

This is a persistent change: it updates the config files.

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

### Remove configuration overrides

Removes the Codex settings previously applied by `npx poe-code@latest configure codex`.

```bash
npx poe-code@latest remove codex
```

## Utilities

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

### Test Configuration

```bash
npx poe-code@latest test codex

npx poe-code@latest test --stdin claude-code
# Verifies that stdin prompts work by running a tiny spawn and expecting `STDIN_OK`.
```

### Spawn a coding agent

```bash
# Claude Code
npx poe-code@latest spawn claude-code "Explain this error message"

cat prompt.txt | npx poe-code@latest spawn codex
# Reads the prompt from stdin (useful for very long prompts).
```

### Optional Flags

- `--dry-run` – show every mutation without touching disk.
- `--yes` – accept defaults for prompts.
- `-C, --cwd <path>` – run `spawn` from a specific working directory so provider CLIs see the right project files.
