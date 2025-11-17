POE.md

Project: poe-code
Purpose: Fast CLI to wire local developer tools to the Poe API, with interactive mode and safe dry‑run operations.

What this repo provides
- CLI binary: poe-code
- Editor/tool integrations: claude-code, codex (extensible)
- Interactive chat UI (Ink) with tool calling for local automation
- Python starter scaffold that can call the Poe API out of the box
- Dry-run recording filesystem for safe previews

How it connects to Poe
- Stores a Poe API key at ~/.poe-code/credentials.json (JSON: { apiKey })
- Uses the key for:
  - poe-code test: pings EchoBot and expects echo
  - poe-code query "...": quick model query (defaults to Claude‑Sonnet‑4.5)
  - configure commands: inject credentials into supported tools

Key commands
- poe-code login --api-key <key>: save Poe key
- poe-code test: verify the key by pinging EchoBot
- poe-code query "message": quick request to the default model
- poe-code configure claude-code: write ~/.claude/settings.json and run health checks
- poe-code configure codex --model gpt-5 --reasoning-effort medium: write ~/.codex/config.toml
- poe-code --dry-run <command ...>: preview file mutations only

Models and defaults
- Default chat model: Claude-Sonnet-4.5 (can be changed via flags)
- Reasoning effort: configurable for providers that support it (e.g., codex)

Interactive mode
- Start: npx poe-code interactive
- In-chat shortcuts: /model, /clear, /history, /tools
- Tool calling available: read_file, write_file, list_files, run_command, search_web (placeholder)

Generated project (init)
- Creates a minimal Python app with .env, main.py, requirements.txt using Handlebars templates at src/templates/python/

Dry‑run architecture
- Implemented via src/utils/dry-run.ts (createDryRunFileSystem)
- Records mkdir, writeFile, unlink, etc.; prints a plan instead of touching disk

Dev notes
- TypeScript, Node >=18, React/Ink UI
- Build: npm run build (tsc + template copy)
- Tests: npm test (vitest)
- Binaries exposed in package.json: dist/index.js

Extending providers
- Goal: open-source contributions to add more providers/services
- Service definitions include prerequisites (before/after) and declarative mutations

Security
- API key stored locally in ~/.poe-code/credentials.json
- Backups created during configure to allow rollback

See also
- README.md: quick start and CLI reference
- ARCHITECTURE.md: declarative service model
- DEVELOPMENT.md: contributor setup
