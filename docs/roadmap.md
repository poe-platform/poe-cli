# Roadmap

## Beta split

- [x] `poe-code` mirrors `poe-code-configure` – configure-only CLI, no agent commands.
- [x] `poe-code-beta` owns interactive + non-interactive agents via `beta/src`.
- [x] VSCode extension + preview webview now live under `beta/vscode-extension`.
- [x] Agent runtime, prompts, MCP docs, and roadmap moved under `beta/docs`.
- [x] Root README limited to configuration features; beta README highlights agent workflows.

## Follow-ups

- Confirm new beta publishing pipeline (`npm publish beta/`) before tagging releases.
- Audit future docs to ensure agent-specific content lands in `beta/docs/`.
