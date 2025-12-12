# Isolated Configuration Management via Wrapper Scripts

## Overview

This document describes the isolated configuration management system for `poe-code`, which uses wrapper scripts and dedicated configuration directories to avoid modifying users' global configurations.

## Motivation

Previously, `poe-code` directly modified users' global configuration files for each coding agent provider (e.g., `~/.claude/settings.json`, `~/.codex/config.toml`). This approach had several drawbacks:

1. **Destructive Operations**: Direct modification of user configurations could conflict with existing setups
2. **Complex Maintenance**: Required intricate parsing, merging, and pruning logic for various config formats
3. **Fragile State Management**: Removal operations needed to carefully prune only poe-code-related settings
4. **No Side-by-Side Usage**: Users couldn't easily maintain both poe-configured and native configurations

## Solution Architecture

The new system uses two key components:

1. **Isolated Configuration Directories**: All poe-code configurations are stored in `~/.poe-code/<provider>/` subdirectories
2. **Wrapper CLI Commands**: NPM-installed wrapper commands (`poe-claude`, `poe-codex`, etc.) that use the isolated configurations

## Directory Structure

```
~/.poe-code/
├── claude-code/
│   ├── settings.json
│   └── anthropic_key.sh
├── codex/
│   └── config.toml
├── opencode/
│   ├── config.json
│   └── auth.json
└── kimi/
    └── config.json
```

## Wrapper Commands

The package provides wrapper CLI commands for all supported coding agents:

- `poe-claude` - Claude Code wrapper
- `poe-codex` - Codex wrapper
- `poe-opencode` - OpenCode wrapper
- `poe-kimi` - Kimi wrapper

These commands are installed as part of the `poe-code` npm package and are available globally when the package is installed.

## Implementation Details

### Configuration Generation

The `configure` command generates all agent configurations into isolated subdirectories under `~/.poe-code/<provider>/`:

```bash
poe-code configure claude-code
# Creates configuration in ~/.poe-code/claude-code/
```

**Note**: Not all coding agents support custom configuration paths via environment variables. The wrapper commands handle this by using the appropriate mechanisms for each provider.

### Spawn Command

The `spawn` command uses the generated isolated configurations when available. If a configuration exists for the requested provider, it will be used automatically:

```bash
poe-code spawn claude-code "implement feature X"
# Uses configuration from ~/.poe-code/claude-code/ if configured
```

If no configuration exists, the spawn command falls back to the wrapper version with default settings.

### Wrapper Command Implementation

Each wrapper command is implemented as a Node.js script that:

1. Locates the isolated configuration directory for its provider
2. Configures the provider to use the isolated configuration
3. Executes the underlying provider CLI with appropriate arguments

Example for Claude Code (`poe-claude`):

```javascript
#!/usr/bin/env node
// Wrapper that ensures Claude Code uses isolated poe-code configuration
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');

const configDir = path.join(os.homedir(), '.poe-code', 'claude-code');

// Set environment to use isolated config
process.env.CLAUDE_CONFIG_DIR = configDir;

// Execute the actual Claude Code CLI
const claude = spawn('claude', process.argv.slice(2), {
  stdio: 'inherit',
  env: process.env
});

claude.on('exit', (code) => {
  process.exit(code);
});
```

### Provider-Specific Mechanisms

Different providers use different mechanisms to specify configuration directories:

- **Claude Code**: `CLAUDE_CONFIG_DIR` environment variable
- **Codex**: Configuration path via CLI flags or environment variables (implementation-specific)
- **OpenCode**: Configuration path via CLI flags or environment variables (implementation-specific)
- **Kimi**: Configuration path via CLI flags or environment variables (implementation-specific)

## Benefits

1. **Non-Destructive**: Never modifies users' original configurations
2. **Isolated**: Each poe-code configuration lives in a dedicated subdirectory
3. **Simpler Codebase**: Eliminates complex merge/prune logic - just write fresh configs
4. **Side-by-Side Usage**: Users can run native commands and poe-wrapped commands independently
5. **Easier Testing**: Isolated environments are easier to test and reason about
6. **Better Uninstall**: Simply remove the npm package and optionally delete `~/.poe-code/` directory

## Command Reference

### Configure

No changes to the configure command interface:

```bash
poe-code configure <provider>
```

Generates isolated configuration in `~/.poe-code/<provider>/`.

### Remove

No changes to the remove command interface:

```bash
poe-code remove <provider>
```

Removes the isolated configuration directory for the specified provider.

### Spawn

Enhanced spawn command that uses isolated configurations:

```bash
poe-code spawn <provider> <prompt> [options]
```

When a configuration exists for the provider, it will be used automatically. Otherwise, falls back to wrapper version with default settings.

### Wrapper Commands

Direct execution of coding agents with poe-code configuration:

```bash
poe-claude [arguments]   # Claude Code with poe-code config
poe-codex [arguments]    # Codex with poe-code config
poe-opencode [arguments] # OpenCode with poe-code config
poe-kimi [arguments]     # Kimi with poe-code config
```

## Migration Notes

For users migrating from the previous version:

1. Existing global configurations are not automatically migrated
2. Run `poe-code configure <provider>` to create new isolated configurations
3. Previous configurations in global directories remain untouched
4. Users can continue using native commands without interference

## Future Considerations

- Potential support for multiple configuration profiles per provider
- Configuration import/export functionality
- Configuration validation and diagnostics
