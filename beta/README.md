# poe-code-beta

> Experimental workspace for the interactive agent, VSCode extension, and async tooling.

## Packages

- `poe-code-beta` – beta CLI (`beta/src`) surfaced as the `poe-code-beta` binary.
- `poe-code-vscode` – VSCode extension under `beta/vscode-extension`.
- `@poe/shared-utils` – shared webview helpers in `beta/shared`.

## Getting Started

```bash
cd beta
npm install
npm run build   # builds the CLI and webview assets
npm run dev     # run the beta CLI with tsx
```

## Key Commands

```bash
# Interactive agent shell
poe-code-beta

# Non-interactive agent run
poe-code-beta agent "Summarize the latest diff"

# Spawn a configured CLI in a one-off task
poe-code-beta spawn claude-code "List the steps as bullets"
```

The beta CLI reuses the stable `poe-code` adapters for configuration while keeping
all agent-only commands, state, prompts, and docs inside `beta/`.

## Folder Guide

- `src/cli` – beta-only commands (`agent`, `interactive`, `spawn`, etc.).
- `src/services` – agent runtime (session manager, tools, MCP bridge).
- `vscode-extension` – sidebar provider, preview app, and integration tests.
- `docs/` – SYSTEM_PROMPT, architecture notes, MCP instructions, roadmap.

## Tests

```bash
npm run test --workspace beta
```

Vitest covers CLI behaviour, agent tooling, and the VSCode webview.  
VSCode E2E tests remain skipped unless `RUN_VSCODE_E2E=true` is set.
