# Add Isolated Configuration Management via Wrapper Scripts

## Goal

Give users a way to try out the integration without destructive edits to user/global agent configuration by generating Poe-specific configs in isolated per-agent directories and using wrapper CLIs to run the agent with that isolated configuration.

## Spec

Try to reuse existing logic
`target: "~/.codex/config.toml"`

- add validation that all targets must be in ~ home
- for the isolated run, reuse the same logic, but pretend that home directory is ~/.poe-code/configs/

- `configure`: no change in command surface/UX.
  - Configure command keeps isolated and overwritten configs in sync.
- `remove`: no change in command surface/UX.

- The npm package should expose wrapper CLI commands for supported coding agents:
  - `poe-claude`
  - `poe-codex`
  - `poe-opencode`

  - Wrappers don't transform arguments; everything is passed through as-is.

- Providers accept an `isolatedEnv` option.
- Wrappers use a shared `isolatedEnvRunner` that pulls isolated configuration details from providers.

## Directory Layout - fixed configs stay same

## Directory Layout - isolated configs

All generated agent config lives under the user's home directory:

```
~/.poe-code/
  credentials.json
  logs/
  claude-code/
    settings.json
    anthropic_key.sh
  codex/
    config.toml
  opencode/
    .config/opencode/config.json
    .local/share/opencode/auth.json
```

## Wrapper CLIs

Wrappers are installed via `npm` bin entrypoints and run the underlying agent binary with environment overrides pointing at the isolated config directory.

- `poe-claude` runs `claude` with `CLAUDE_CONFIG_DIR=~/.poe-code/claude-code`.
- `poe-codex` runs `codex` with `CODEX_HOME=~/.poe-code/codex` and `XDG_CONFIG_HOME=~/.poe-code/codex`.
- `poe-opencode` runs `opencode` with `XDG_CONFIG_HOME=~/.poe-code/opencode` and `XDG_DATA_HOME=~/.poe-code/opencode`.

## Spawn Behavior

- agent configured? - use regular config
- agent not configured - use isolated config

## When isolated configs are generated

Think about isolated config as temp files, lazy generated files

- spawn when not configured, and isolated configs not present
- wrapper when isolated configs not present
- doctor will remove isolated configs, so next wrapper or spawn can generate them

## STDIN wrappers

Wrappers must support stdin for input, and directly pass it through to the model. No validation should be happening here, no errors for not supported.
