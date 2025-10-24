# poe-setup

Fast CLI to wire your local dev tools to the Poe API.

Quick install

```bash
# Zero-install (recommended)
npx poe-setup --help

# Or install globally
npm i -g poe-setup
```

90‑second setup

```bash
# Interactive, Claude Code–style UI
npx poe-setup interactive
# alias also available
npx poe-cli interactive

# Configure editors/tools in one command
npx poe-setup configure claude-code
npx poe-setup configure codex --model gpt-5 --reasoning-effort medium

# Save your Poe API key once
npx poe-setup login --api-key YOUR_KEY

# Sanity checks
npx poe-setup test
npx poe-setup --dry-run configure claude-code --api-key YOUR_KEY
```

Why poe-setup
- Guided flow that injects Poe credentials into Claude Code and other tools
- Dry‑run mode shows planned filesystem changes (safe preview)
- Interactive mode powered by Ink
- Automatic backups for easy rollback

What you get
- Ready‑to‑run Python starter wired to Poe
- One‑command config for Claude Code and Codex

Interactive mode
```bash
npx poe-setup interactive
```
Features
- Chat with AI models via the Poe API
- **Visual tool calling**: See tools being used in real-time with `⏺ ToolName(args) ⎿ result`
- Tool calling: read/write files, list dirs, run commands, web search (placeholder)
- **MCP (Model Context Protocol)**: Add external tools from MCP servers
- Switch models on the fly with /model
- Setup commands available from chat

Key commands
- help – list commands
- configure <service> – claude-code, codex, opencode
- init <project-name> – new project scaffold
- login <api-key>, logout – manage credentials
- /model [name], /clear, /history, /tools – chat shortcuts
- **/mcp add/remove/connect** – manage MCP servers

MCP Quick Start
```bash
# In interactive mode
> /mcp add filesystem npx -y @modelcontextprotocol/server-filesystem /path/to/dir
> /tools  # See the new MCP tools
> What files are in my directory?  # AI uses MCP tools
```

See [MCP.md](./MCP.md) for full MCP documentation.

CLI reference

Global flags
- --dry-run – in‑memory FS recorder, prints planned writes
- --verbose – stream each step

init
Scaffold a Python project for Poe.
```bash
poe-setup init [--project-name <name>] [--api-key <key>] [--model <model>]
```
- Prompts for missing args
- Generates .env, main.py, requirements.txt from templates
- Persists API key (skipped in --dry-run)

configure
Set up editor integrations.
```bash
poe-setup configure <service> [--api-key <key>] [--model <model>] [--reasoning-effort <level>]
```
- claude-code – writes ~/.claude/settings.json and verifies the `claude` CLI health check
- codex – writes ~/.codex/config.toml from template (creates dir)
- Stores provided/prompted API key unless --dry-run

prerequisites
```bash
poe-setup prerequisites <service> <phase>
```
- phase: before | after. Runs checks without touching FS

remove
```bash
poe-setup remove <service>
```
- Removes only manifest‑managed settings; leaves other content
- Idempotent; returns 0 when nothing to do

login/logout
```bash
poe-setup login [--api-key <key>]
poe-setup logout
```
- Stores at ~/.poe-setup/credentials.json

test
```bash
poe-setup test [--api-key <key>]
```
- Pings EchoBot and expects echo (skips network in --dry-run)

Dry‑run architecture
When --dry-run is on, the CLI swaps the FS with createDryRunFileSystem (src/utils/dry-run.ts) and prints intended operations (mkdir, writeFile, unlink, …).

VS Code Extension

Use Poe Code directly in VS Code with a single click!

```bash
cd vscode-extension
npm install
npm run compile
npm run package
```

Then install the generated `.vsix` file in VS Code:
1. Open Extensions view (Ctrl+Shift+X / Cmd+Shift+X)
2. Click `...` menu → "Install from VSIX..."
3. Select the `.vsix` file
4. Click the terminal icon in the editor toolbar to launch Poe Code

See [vscode-extension/README.md](./vscode-extension/README.md) for details.

Contributing and docs
- DEVELOPMENT.md – contributor setup and testing
- ARCHITECTURE.md – declarative service model overview
